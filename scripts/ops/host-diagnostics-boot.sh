#!/usr/bin/env bash
# 开机后捞上一启动周期的内核 OOM / kill 痕迹（依赖 journald 持久化）。
# cron: @reboot sleep 30; /opt/finance-site/scripts/ops/host-diagnostics-boot.sh

set -u

SITE_ROOT="${SITE_ROOT:-/opt/finance-site}"
LOG_DIR="${LOG_DIR:-$SITE_ROOT/logs/diagnostics}"
BOOT_DIR="$LOG_DIR/boot"
mkdir -p "$BOOT_DIR"

out="$BOOT_DIR/boot-$(date -u +"%Y%m%dT%H%M%SZ").log"

{
  echo "=== boot salvage $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
  echo "hostname: $(hostname 2>/dev/null || true)"
  echo "uptime: $(uptime 2>/dev/null || true)"
  echo
  echo "--- previous boot kernel OOM (journalctl -b -1) ---"
  if command -v journalctl >/dev/null 2>&1; then
    journalctl -k -b -1 --no-pager 2>/dev/null | grep -iE 'oom|killed process|out of memory' | tail -n 80 || true
    echo
    echo "--- previous boot: last 50 kernel lines ---"
    journalctl -k -b -1 -n 50 --no-pager 2>/dev/null || true
  else
    echo "journalctl not available"
  fi
  echo
  echo "--- current boot early dmesg OOM ---"
  dmesg -T 2>/dev/null | grep -iE 'oom|killed process|out of memory' | tail -n 40 || true
  echo
  echo "--- last heartbeat lines ---"
  if [[ -f "$LOG_DIR/heartbeat.log" ]]; then
    tail -n 40 "$LOG_DIR/heartbeat.log" || true
  fi
  echo
  echo "--- latest incident symlink ---"
  if [[ -L "$LOG_DIR/incidents/LATEST" || -f "$LOG_DIR/incidents/LATEST" ]]; then
    echo "LATEST -> $(readlink -f "$LOG_DIR/incidents/LATEST" 2>/dev/null || readlink "$LOG_DIR/incidents/LATEST" 2>/dev/null || true)"
  fi
} >"$out" 2>&1

ln -sfn "$(basename "$out")" "$BOOT_DIR/LATEST"
find "$BOOT_DIR" -type f -name 'boot-*.log' -mtime +30 -delete 2>/dev/null || true

exit 0
