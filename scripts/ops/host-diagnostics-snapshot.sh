#!/usr/bin/env bash
# 主机诊断快照：定时写心跳；内存/swap/负载吃紧时再打一份详细现场。
# 目的：机器卡死、VNC/SSH 进不去、强制重启后，仍能从磁盘日志排查。
#
# 安装（root crontab）：
#   */2 * * * * /opt/finance-site/scripts/ops/host-diagnostics-snapshot.sh
# 另见：scripts/ops/host-diagnostics-boot.sh（@reboot）
# 说明：docs/OPS_HOST_DIAGNOSTICS.md

set -u

SITE_ROOT="${SITE_ROOT:-/opt/finance-site}"
LOG_DIR="${LOG_DIR:-$SITE_ROOT/logs/diagnostics}"
HEARTBEAT="$LOG_DIR/heartbeat.log"
INCIDENT_DIR="$LOG_DIR/incidents"
KEEP_DAYS="${KEEP_DAYS:-14}"
# 告警冷却：压力持续时最多每 N 秒写一份 incident，避免刷盘
ALERT_COOLDOWN_SEC="${ALERT_COOLDOWN_SEC:-120}"
# 心跳文件过大时截断保留尾部
HEARTBEAT_MAX_BYTES="${HEARTBEAT_MAX_BYTES:-2097152}"

MEM_WARN_PCT="${MEM_WARN_PCT:-85}"
SWAP_WARN_MB="${SWAP_WARN_MB:-64}"
LOAD_WARN_MULT="${LOAD_WARN_MULT:-1.5}"

mkdir -p "$INCIDENT_DIR"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
ts_file() { date -u +"%Y%m%dT%H%M%SZ"; }

# --- 采集指标 ---
ncpu="$(nproc 2>/dev/null || echo 1)"
load1="$(awk '{print $1}' /proc/loadavg)"
read -r mem_total_kb mem_avail_kb <<<"$(awk '
  /^MemTotal:/ { t=$2 }
  /^MemAvailable:/ { a=$2 }
  END { print t+0, a+0 }
' /proc/meminfo)"
read -r swap_total_kb swap_free_kb <<<"$(awk '
  /^SwapTotal:/ { t=$2 }
  /^SwapFree:/ { f=$2 }
  END { print t+0, f+0 }
' /proc/meminfo)"

mem_used_pct=0
if [[ "$mem_total_kb" -gt 0 ]]; then
  mem_used_pct=$(( (100 * (mem_total_kb - mem_avail_kb)) / mem_total_kb ))
fi
swap_used_kb=$(( swap_total_kb - swap_free_kb ))
swap_used_mb=$(( swap_used_kb / 1024 ))

load_warn="$(awk -v n="$ncpu" -v m="$LOAD_WARN_MULT" 'BEGIN { printf "%.2f", n*m }')"
load_high=0
awk -v l="$load1" -v w="$load_warn" 'BEGIN { exit !(l+0 >= w+0) }' && load_high=1

alert=0
reasons=()
if [[ "$mem_used_pct" -ge "$MEM_WARN_PCT" ]]; then
  alert=1
  reasons+=("mem=${mem_used_pct}%")
fi
if [[ "$swap_used_mb" -ge "$SWAP_WARN_MB" ]]; then
  alert=1
  reasons+=("swap=${swap_used_mb}MB")
fi
if [[ "$load_high" -eq 1 ]]; then
  alert=1
  reasons+=("load1=${load1}>${load_warn}")
fi

reason_str="ok"
if [[ "$alert" -eq 1 ]]; then
  reason_str=$(IFS=,; echo "${reasons[*]}")
fi

# --- 心跳（一行，重启后可读）---
printf '%s mem_used=%s%% mem_avail_kb=%s swap_used_mb=%s load1=%s ncpu=%s alert=%s reason=%s\n' \
  "$(ts)" "$mem_used_pct" "$mem_avail_kb" "$swap_used_mb" "$load1" "$ncpu" "$alert" "$reason_str" \
  >>"$HEARTBEAT"

if [[ -f "$HEARTBEAT" ]]; then
  hb_size=$(wc -c <"$HEARTBEAT" | tr -d ' ')
  if [[ "${hb_size:-0}" -gt "$HEARTBEAT_MAX_BYTES" ]]; then
    tmp="${HEARTBEAT}.tmp"
    tail -c "$HEARTBEAT_MAX_BYTES" "$HEARTBEAT" >"$tmp" && mv "$tmp" "$HEARTBEAT"
  fi
fi

# --- 压力时写详细现场 ---
dump_incident() {
  local out="$1"
  {
    echo "=== host diagnostics incident $(ts) ==="
    echo "reasons: $reason_str"
    echo
    echo "--- uptime / load ---"
    uptime || true
    cat /proc/loadavg || true
    echo
    echo "--- memory ---"
    free -h || true
    echo
    echo "--- disk ---"
    df -h || true
    echo
    echo "--- top CPU ---"
    ps aux --sort=-%cpu 2>/dev/null | head -30 || true
    echo
    echo "--- top MEM ---"
    ps aux --sort=-%mem 2>/dev/null | head -30 || true
    echo
    echo "--- pm2 ---"
    if command -v pm2 >/dev/null 2>&1; then
      pm2 list 2>/dev/null || true
      pm2 jlist 2>/dev/null | head -c 200000 || true
      echo
    fi
    echo "--- pm2 error log (tail) ---"
    for f in /root/.pm2/logs/finance-site-error.log "$HOME/.pm2/logs/finance-site-error.log"; do
      if [[ -f "$f" ]]; then
        echo "# $f"
        tail -n 80 "$f" || true
      fi
    done
    echo
    echo "--- dmesg OOM / kill (tail) ---"
    dmesg -T 2>/dev/null | grep -iE 'oom|killed process|out of memory' | tail -n 40 || true
    echo
    echo "--- postgres activity (best effort) ---"
    if command -v sudo >/dev/null 2>&1; then
      sudo -n -u postgres psql -d finance -Atc \
        "SELECT pid, state, now()-query_start AS age, left(query,120) FROM pg_stat_activity WHERE state <> 'idle' ORDER BY query_start NULLS LAST LIMIT 20;" \
        2>/dev/null || true
    fi
    echo
    echo "--- nginx access (last 30 lines, best effort) ---"
    for f in /var/log/nginx/access.log /var/log/nginx/access.log.1; do
      if [[ -f "$f" ]]; then
        echo "# $f"
        tail -n 30 "$f" || true
      fi
    done
    echo
    echo "--- iostat (best effort) ---"
    if command -v iostat >/dev/null 2>&1; then
      iostat -xz 1 2 2>/dev/null || true
    fi
  } >"$out" 2>&1
}

if [[ "$alert" -eq 1 ]]; then
  stamp_file="$INCIDENT_DIR/.last_alert_epoch"
  now_epoch=$(date +%s)
  last_epoch=0
  [[ -f "$stamp_file" ]] && last_epoch=$(cat "$stamp_file" 2>/dev/null || echo 0)
  if [[ $((now_epoch - last_epoch)) -ge "$ALERT_COOLDOWN_SEC" ]]; then
    incident_file="$INCIDENT_DIR/incident-$(ts_file).log"
    dump_incident "$incident_file"
    echo "$now_epoch" >"$stamp_file"
    ln -sfn "$(basename "$incident_file")" "$INCIDENT_DIR/LATEST"
  fi
fi

# 清理过期 incident
find "$INCIDENT_DIR" -type f -name 'incident-*.log' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

exit 0
