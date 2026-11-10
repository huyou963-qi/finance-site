#!/usr/bin/env bash
# 群晖拉取香港生产库备份。香港本机定时生成备份文件（scripts/ops/backup/hk-nas-backup-produce.sh），
# 这里只做三件事：限速 rsync 拉取、本地留存与清理、定期恢复演练。群晖不持有数据库口令。
#
# 群晖「任务计划」每小时执行一次（root）：
#   docker exec finance-db-backup backup.sh tick
#
# 子命令：
#   tick            每小时入口：有新备份就拉 + 清理；到期时跑演练；每天两次检查是否过期
#   init-keys       首次：生成 SSH key、抓取香港 host key，打印公钥
#   pull-small      拉 files / app（每天）/ core（每周）
#   pull-physical   拉物理备份（体积大，后台限速跑，可断点续传）
#   drill           恢复演练：最新逻辑备份恢复到临时库并核对行数
#   drill-physical  恢复演练：解包物理备份链、合并、校验并启动（临时占用约 50GB）
#   status          列出各类备份的最新时间；过期则非零退出
# 说明：docs/OPS_NAS_BACKUP.md

set -euo pipefail
export TZ="${TZ:-Asia/Shanghai}"

HK_HOST="${HK_HOST:?HK_HOST is required}"
HK_SSH_PORT="${HK_SSH_PORT:-22}"
HK_SSH_USER="${HK_SSH_USER:-nasbackup}"
KEY="${SSH_KEY_PATH:-/run/keys/id_ed25519}"
KH="${SSH_KNOWN_HOSTS_PATH:-/run/keys/known_hosts}"
ROOT="${BACKUP_ROOT:-/backup}"

# 香港公网出口约 1 Mbps（≈120 KB/s），全站共用；单位 KB/s
SMALL_BWLIMIT="${SMALL_BWLIMIT:-80}"
PHYS_BWLIMIT="${PHYS_BWLIMIT:-50}"
APP_KEEP_DAYS="${APP_KEEP_DAYS:-30}"          # 业务表每天一份，留 30 天
APP_KEEP_WEEKLY_WEEKS="${APP_KEEP_WEEKLY_WEEKS:-12}"  # 之后只留周日那份，留 12 周
CORE_KEEP="${CORE_KEEP:-12}"                  # mds 核心每周一份，留 12 份
FILES_KEEP_DAYS="${FILES_KEEP_DAYS:-30}"
PHYS_KEEP_CHAINS="${PHYS_KEEP_CHAINS:-2}"   # 一条链 = 一份全量 + 其后的每周增量（约一个月）
DRILL_PHYS_MIN_FREE_GB="${DRILL_PHYS_MIN_FREE_GB:-60}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

STATE="$ROOT/state"
LOGDIR="$STATE/logs"
STAMPS="$STATE/stamps"
# 演练放在容器自己的文件系统里：共享文件夹带 DSM ACL，容器里的 postgres 用户进不去
DRILL_DIR="${DRILL_DIR:-/var/tmp/drill}"
mkdir -p "$LOGDIR" "$STAMPS" "$ROOT/app" "$ROOT/core" "$ROOT/physical" "$ROOT/files/history"

log() { echo "[$(date '+%F %T')] $*"; }
die() { log "ERROR: $*"; exit 1; }
stamp() { date +%s > "$STAMPS/$1"; }
stamp_age() { [ -f "$STAMPS/$1" ] && echo $(( $(date +%s) - $(cat "$STAMPS/$1") )) || echo 999999999; }
as_pg() { if command -v su-exec >/dev/null; then su-exec postgres "$@"; else runuser -u postgres -- "$@"; fi; }

SSH_CMD="ssh -i $KEY -p $HK_SSH_PORT -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KH -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -o ConnectTimeout=20 -o Compression=no"

pull() { # $1=子目录 $2=限速 KB/s；成功后给本地已有的备份打 .complete（之后才参与演练/计算新鲜度）
  rsync -a --partial-dir=.rsync-partial --timeout=900 --bwlimit="$2" --exclude='.rsync-partial' \
    -e "$SSH_CMD" "$HK_SSH_USER@$HK_HOST:$1/" "$ROOT/$1/"
  local d
  for d in "$ROOT/$1"/*/; do [ -d "$d" ] && [ ! -e "$d/.complete" ] && touch "$d/.complete"; done
  return 0
}
complete_dirs() { local d; for d in "$ROOT/$1"/*/; do if [ -e "$d/.complete" ]; then echo "${d%/}"; fi; done | sort; }

# ---------- 拉取 ----------
job_pull_small() {
  local cur="$ROOT/files/current" today
  mkdir -p "$cur"
  rsync -a --delete --timeout=600 --bwlimit="$SMALL_BWLIMIT" -e "$SSH_CMD" "$HK_SSH_USER@$HK_HOST:files/" "$cur/"
  today="$(date +%Y%m%d)"
  [ -d "$ROOT/files/history/$today" ] || cp -al "$cur" "$ROOT/files/history/$today"
  find "$ROOT/files/history" -mindepth 1 -maxdepth 1 -type d -mtime +"$FILES_KEEP_DAYS" -exec rm -rf {} +
  pull app "$SMALL_BWLIMIT"
  pull core "$SMALL_BWLIMIT"
  prune_app; prune_core
  stamp pull-small; log "pull-small ok"
}

job_pull_physical() {
  pull physical "$PHYS_BWLIMIT"
  prune_physical
  stamp pull-physical; log "pull-physical ok: $(du -sh "$ROOT/physical" | cut -f1) on NAS"
}

# ---------- 清理 ----------
name_ts() { date -d "${1:0:8} ${1:9:2}:${1:11:2}" +%s 2>/dev/null; }   # 20261110-0305 → epoch

prune_app() { # 最近 N 天全部 + 之后周日那份保留 W 周
  local d n ts now; now="$(date +%s)"
  for d in "$ROOT"/app/*/; do
    d="${d%/}"; n="$(basename "$d")"; ts="$(name_ts "$n")" || continue
    [ $(( now - ts )) -le $(( APP_KEEP_DAYS * 86400 )) ] && continue
    if [ "$(date -d "${n:0:8}" +%u)" != 7 ] || [ $(( now - ts )) -gt $(( APP_KEEP_WEEKLY_WEEKS * 7 * 86400 )) ]; then rm -rf "$d"; fi
  done
}
prune_core() { complete_dirs core | head -n -"$CORE_KEEP" | xargs -r rm -rf; }
prune_physical() { # 保留最近 K 条链：从倒数第 K 个全量起的都留
  local fulls cut
  fulls="$(complete_dirs physical | grep -- '-full$' || true)"
  [ "$(echo "$fulls" | grep -c .)" -gt "$PHYS_KEEP_CHAINS" ] || return 0
  cut="$(basename "$(echo "$fulls" | tail -n "$PHYS_KEEP_CHAINS" | head -1)")"
  complete_dirs physical | while read -r d; do [[ "$(basename "$d")" < "$cut" ]] && rm -rf "$d"; done
  return 0
}

# ---------- 恢复演练 ----------
drill_init() { rm -rf "$DRILL_DIR"; mkdir -p "$DRILL_DIR"; chown postgres "$DRILL_DIR"; }
drill_pg_start() { # $1=数据目录 $2=端口
  as_pg pg_ctl -D "$1" -l "$DRILL_DIR/pg-$2.log" -w -t 1800 \
    -o "-p $2 -k $DRILL_DIR -c listen_addresses='' -c max_wal_size=4GB" start
}
drill_pg_stop() { as_pg pg_ctl -D "$1" -m fast -w stop >/dev/null 2>&1 || true; }
dpsql() { psql -X -At -h "$DRILL_DIR" -p "$1" -U postgres -d finance -c "$2"; }

compare_counts() { # $1=counts.tsv $2=端口；比备份时少 >5% 判失败（计数与 dump 非同一快照，允许少量漂移）
  local tbl want got bad=0 n=0
  while IFS=$'\t' read -r tbl want; do
    [ -n "$tbl" ] || continue
    n=$((n+1))
    got="$(dpsql "$2" "select count(*) from ${tbl%%.*}.\"${tbl#*.}\"" 2>/dev/null || echo MISSING)"
    if [ "$got" = MISSING ] || [ "$got" -lt $(( want - want / 20 - 5 )) ]; then
      log "  mismatch $tbl: at-backup=$want restored=$got"; bad=$((bad+1))
    fi
  done < "$1"
  log "  checked $n tables, $bad mismatched"
  [ "$bad" = 0 ]
}

job_drill() {
  local h d data port=25432 rc=0
  h="$(complete_dirs app | tail -1)"; d="$(complete_dirs core | tail -1)"
  [ -n "$h" ] && [ -n "$d" ] || die "no backups to drill"
  drill_init; data="$DRILL_DIR/logical"
  as_pg initdb -D "$data" -A trust -U postgres --no-sync >/dev/null
  drill_pg_start "$data" "$port"
  psql -X -q -h "$DRILL_DIR" -p "$port" -U postgres -d postgres -c "create database finance"
  log "drill: restoring $(basename "$h") + $(basename "$d")"
  pg_restore -h "$DRILL_DIR" -p "$port" -U postgres -d finance --no-owner --no-privileges --exit-on-error -j 2 "$h/app.dump" || rc=1
  pg_restore -h "$DRILL_DIR" -p "$port" -U postgres -d finance --no-owner --no-privileges --exit-on-error -j 2 "$d/mds-core.dump" || rc=1
  [ "$rc" = 0 ] && { compare_counts "$h/counts.tsv" "$port" || rc=1; }
  [ "$rc" = 0 ] && { compare_counts "$d/counts.tsv" "$port" || rc=1; }
  drill_pg_stop "$data"; rm -rf "$DRILL_DIR"
  [ "$rc" = 0 ] || die "logical drill failed"
  stamp drill; log "drill ok"
}

extract_backup() { # $1=备份目录(tar.zst) $2=输出目录(plain)
  mkdir -p "$2/pg_wal"
  tar --zstd -xf "$1/base.tar.zst" -C "$2"
  if [ -f "$1/pg_wal.tar.zst" ]; then tar --zstd -xf "$1/pg_wal.tar.zst" -C "$2/pg_wal"
  elif [ -f "$1/pg_wal.tar" ]; then tar -xf "$1/pg_wal.tar" -C "$2/pg_wal"; fi
  cp "$1/backup_manifest" "$2/"
}

latest_chain() { # 最新全量 + 其后所有已完整拉取的增量
  local all full
  all="$(complete_dirs physical)"
  full="$(echo "$all" | grep -- '-full$' | tail -1)"
  [ -n "$full" ] || return 0
  echo "$all" | awk -v f="$full" '$0 >= f'
}

job_drill_physical() {
  local chain=() plain=() data port=25433 n i free
  mapfile -t chain < <(latest_chain)
  [ "${#chain[@]}" -gt 0 ] || die "no complete physical chain on NAS yet"
  free="$(df -Pk "$(dirname "$DRILL_DIR")" | awk 'NR==2{print int($4/1048576)}')"
  [ "$free" -ge "$DRILL_PHYS_MIN_FREE_GB" ] || die "only ${free}GB free, need ${DRILL_PHYS_MIN_FREE_GB}GB"
  drill_init
  log "drill-physical: ${#chain[@]} backups, $(basename "${chain[0]}") .. $(basename "${chain[-1]}")"
  for i in "${!chain[@]}"; do
    extract_backup "${chain[$i]}" "$DRILL_DIR/b$i"; plain+=("$DRILL_DIR/b$i")
  done
  pg_verifybackup -q "${plain[0]}" || die "pg_verifybackup failed on full backup"
  if [ "${#plain[@]}" -gt 1 ]; then
    data="$DRILL_DIR/combined"
    pg_combinebackup -o "$data" "${plain[@]}" || die "pg_combinebackup failed"
    rm -rf "${plain[@]}"
    pg_verifybackup -q "$data" || die "pg_verifybackup failed on combined backup"
  else
    data="${plain[0]}"
  fi
  # 香港是 Ubuntu 布局，postgresql.conf / pg_hba.conf 在 /etc 下，数据目录里没有，补最小配置
  printf "listen_addresses=''\n" > "$data/postgresql.conf"
  printf "local all all trust\n" > "$data/pg_hba.conf"
  : > "$data/pg_ident.conf"
  chown -R postgres "$data"; chmod 0700 "$data"
  drill_pg_start "$data" "$port" || die "postgres did not start from backup (see $DRILL_DIR/pg-$port.log)"
  n="$(dpsql "$port" 'select count(*) from mds."MacroObservation"')"
  log "  MacroObservation=$n, User=$(dpsql "$port" 'select count(*) from public."User"')"
  drill_pg_stop "$data"; rm -rf "$DRILL_DIR"
  [ "${n:-0}" -gt 0 ] || die "restored database has no MacroObservation rows"
  stamp drill-physical; log "drill-physical ok"
}

# ---------- status：看备份本身的时间（香港生成失败也能发现） ----------
job_status() {
  local bad=0 k limit newest age n
  # 门限：app 每天 03:05 生成 → 30h；core/physical 每周日生成 → 8 天（physical 首份全量要拉 1.5 天，另放宽）
  for k in app:108000 core:691200 physical:777600; do
    limit="${k#*:}"; k="${k%%:*}"
    newest="$(complete_dirs "$k" | tail -1)"; n="$(basename "${newest:-none}")"
    if [ "$k" = core ]; then age=$(( $(date +%s) - $(date -d "${n:0:8}" +%s 2>/dev/null || echo 0) ))
    else age=$(( $(date +%s) - $(name_ts "$n" || echo 0) )); fi
    if [ -z "$newest" ] || [ "$age" -gt "$limit" ]; then log "STALE $k: newest=$n"; bad=1; else log "ok    $k: newest=$n"; fi
  done
  if [ "$(stamp_age pull-small)" -gt 10800 ]; then log "STALE files: last pull $(( $(stamp_age pull-small) / 3600 ))h ago"; bad=1; fi
  for k in drill:777600 drill-physical:3456000; do
    limit="${k#*:}"; k="${k%%:*}"
    if [ "$(stamp_age "$k")" -gt "$limit" ]; then log "STALE $k: no successful run recently"; bad=1; fi
  done
  log "NAS disk: $(df -h "$ROOT" | awk 'NR==2{print $4" free of "$2}'); backups use $(du -sh "$ROOT" 2>/dev/null | cut -f1)"
  return "$bad"
}

# ---------- 调度 ----------
SELF="$(readlink -f "$0")"
run() { # $1=任务；同名任务还在跑则跳过。任务放进独立进程：在 `run x || y` 里 bash 会关掉 set -e
  local logf="$LOGDIR/$1-$(date +%Y%m).log"
  (
    flock -n 9 || { log "$1 skipped: previous run still in progress"; exit 0; }
    "$SELF" __exec "$1" 2>&1 | tee -a "$logf"
    exit "${PIPESTATUS[0]}"
  ) 9>"$STATE/$1.lock"
}
run_bg() { # 长任务后台跑，tick 不被拖住；失败由 status 的过期检查发现
  setsid nohup "$SELF" "$1" >/dev/null 2>&1 < /dev/null &
}

alert() {
  [ -n "$ALERT_WEBHOOK_URL" ] || return 0
  curl -fsS -m 15 -H 'content-type: application/json' \
    -d "{\"text\":\"[群晖备份] $1\"}" "$ALERT_WEBHOOK_URL" >/dev/null || true
}

job_tick() {
  local fail="" hour dow
  hour="$(date +%-H)"; dow="$(date +%u)"
  run pull-small || fail="$fail pull-small"
  run_bg pull-physical
  if [ "$dow" = 7 ] && [ "$hour" -ge 8 ] && [ "$(stamp_age drill)" -gt 518400 ]; then run drill || fail="$fail drill"; fi
  if [ "$dow" = 7 ] && [ "$(date +%-d)" -ge 8 ] && [ "$(date +%-d)" -le 14 ] && [ "$hour" -ge 10 ] \
     && [ "$(stamp_age drill-physical)" -gt 1728000 ]; then run_bg drill-physical; fi
  # 过期检查每天两次，避免断网时每小时刷屏
  if [ "$hour" = 9 ] || [ "$hour" = 21 ]; then job_status || fail="$fail stale"; fi
  if [ -n "$fail" ]; then alert "失败:$fail（日志 $LOGDIR）"; log "tick finished with failures:$fail"; exit 1; fi
  log "tick ok"
}

job_init_keys() {
  [ -f "$KEY" ] || ssh-keygen -t ed25519 -N "" -C "nas-db-backup" -f "$KEY" >/dev/null
  [ -s "$KH" ] || ssh-keyscan -p "$HK_SSH_PORT" -t ed25519 "$HK_HOST" 2>/dev/null > "$KH"
  echo "香港 host key 指纹（应为 SHA256:ZhF8zY70mG9EUePIYhaXSFg7J01RFZ9f2O5YbSATkpE）："
  ssh-keygen -lf "$KH"
  echo; echo "群晖公钥（交给香港 hk-nas-backup-setup.sh --pubkey）："; cat "$KEY.pub"
}

cmd="${1:-tick}"
case "$cmd" in
  tick) job_tick ;;
  init-keys) job_init_keys ;;
  status) job_status ;;
  pull-small|pull-physical|drill|drill-physical) run "$cmd" ;;
  __exec) "job_${2//-/_}" ;;
  *) echo "usage: backup.sh {tick|init-keys|pull-small|pull-physical|drill|drill-physical|status}" >&2; exit 2 ;;
esac
