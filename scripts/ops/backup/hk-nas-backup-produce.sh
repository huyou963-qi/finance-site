#!/usr/bin/env bash
# 在香港本机生成备份文件，放进导出目录，等群晖用只读 rsync 慢慢拉走。
# 为什么在本机生成：香港公网出口只有约 1 Mbps，pg_dump 跨境跑要来回拉整个系统目录（13MB 的库要 4 分钟），
# 本机生成只要几秒，跨境只传压缩后的结果，而且 rsync 可限速、可断点续传。
#
# root cron 调用（hk-nas-backup-setup.sh 安装）：
#   hk-nas-backup-produce.sh files       配置文件快照
#   hk-nas-backup-produce.sh app         每天：业务库（public、h）+ 人工裁定表
#   hk-nas-backup-produce.sh core        每周日：mds 核心（大型可重建表只留结构）
#   hk-nas-backup-produce.sh physical [--full]   每周日：PG17 物理备份，每月第一个周日全量，其余周增量
# 数据库操作都以 Linux 用户 nasbackup 经 unix socket peer 认证执行（只读 + REPLICATION 角色，不需要口令）。
# 说明：docs/OPS_NAS_BACKUP.md

set -euo pipefail
export TZ="${TZ:-Asia/Shanghai}"

OUT="${NAS_EXPORT_DIR:-/var/backups/nas-export}"
NB_USER="${NB_USER:-nasbackup}"
PG_SOCKET="${PG_SOCKET:-/var/run/postgresql}"
PG_PORT="${PG_PORT:-5432}"
DB="${PG_DATABASE:-finance}"
APP_KEEP="${HK_APP_KEEP:-3}"              # 香港只留最近几份，群晖每小时检查一次有没有新的
CORE_KEEP="${HK_CORE_KEEP:-2}"
PHYS_KEEP_DAYS="${HK_PHYS_KEEP_DAYS:-10}"   # 群晖断线超过这么久，增量链会断，等下个月全量或手动 --full
PHYS_MAX_RATE="${HK_PHYS_MAX_RATE:-30M}"    # 本机读盘限速，减轻对线上 IO 的冲击
FULL_MIN_FREE_GB="${HK_FULL_MIN_FREE_GB:-9}"
INCR_MIN_FREE_GB="${HK_INCR_MIN_FREE_GB:-3}"
APP_EXTRA_TABLES="${APP_EXTRA_TABLES:-mds.ownership_review}"
# core 只留结构的表：体量大、可从 SEC/Yahoo/13F 等公开源重建，物理备份已覆盖
CORE_EXCLUDE_DATA="${CORE_EXCLUDE_DATA:-institutional_holding sec_filing equity_daily_bar dera_insider_transaction dera_insider_filing dera_insider_owner insider_transaction factor_snapshot equity_fundamental_snapshot fetch_run schedule_audit_event _bak_*}"

STATE="$OUT/.state"
WORK="$OUT/.work"

log() { echo "[$(date '+%F %T')] $1: $2"; }
die() { log "${MODE:-?}" "ERROR: $*"; exit 1; }

# 以 nasbackup 身份、低 CPU/IO 优先级执行
as_nb() {
  runuser -u "$NB_USER" -- env PGHOST="$PG_SOCKET" PGPORT="$PG_PORT" PGDATABASE="$DB" PGUSER="$NB_USER" \
    nice -n 10 ionice -c2 -n7 "$@"
}

prepare() {
  install -d -m 0750 -o root -g "$NB_USER" "$OUT"
  install -d -m 0750 -o "$NB_USER" -g "$NB_USER" "$STATE" "$WORK" "$OUT/app" "$OUT/core" "$OUT/physical"
  install -d -m 0750 -o root -g "$NB_USER" "$OUT/files"
  find "$WORK" -mindepth 1 -maxdepth 1 -mmin +1440 -exec rm -rf {} + 2>/dev/null || true
}

free_gb() { df -Pk "$OUT" | awk 'NR==2{print int($4/1048576)}'; }

# 精确行数（群晖恢复演练用来核对）。$1=schema 列表(逗号) $2=不统计的表(空格分隔，支持 *)
record_counts() {
  local where="" t
  for t in $2; do where="$where and table_name not like '${t//\*/%}'"; done
  as_nb psql -X -At -F $'\t' -v ON_ERROR_STOP=1 -c "
    select table_schema||'.'||table_name,
      (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
    from information_schema.tables
    where table_type='BASE TABLE' and table_schema = any(string_to_array('$1', ','))$where
    order by 1"
}

keep_newest() { # $1=目录 $2=保留个数
  ls -1d "$1"/*/ 2>/dev/null | sort | head -n -"$2" | xargs -r rm -rf
}

publish() { # $1=工作目录 $2=目标
  chown -R "$NB_USER:$NB_USER" "$1"; chmod -R u=rwX,g=rX,o= "$1"
  rm -rf "$2"; mv "$1" "$2"
}

do_files() {
  local w="$WORK/files"
  rm -rf "$w"; mkdir -p "$w"
  [ -e /opt/finance-site-shared/.env.local ] && cp -a /opt/finance-site-shared/.env.local "$w/env.local"
  tar -czf "$w/etc-nginx.tgz" -C /etc nginx 2>/dev/null || true
  tar -czf "$w/etc-postgresql.tgz" -C /etc postgresql 2>/dev/null || true
  tar -czf "$w/etc-cron.d.tgz" -C /etc cron.d 2>/dev/null || true
  # HTTPS 证书与 certbot 账号（含私钥；群晖侧只放管理员可读的共享文件夹）
  [ -d /etc/letsencrypt ] && tar -czf "$w/etc-letsencrypt.tgz" -C /etc letsencrypt
  # 系统级服务定义：pm2 开机自启、ufw 规则
  tar -czf "$w/etc-system.tgz" -C / etc/systemd/system/pm2-root.service etc/ufw/user.rules etc/ufw/user6.rules 2>/dev/null || true
  # 各账号登记的 SSH 公钥（群晖中国官网代理 china-proxy 反向隧道、群晖备份 nasbackup、GitHub 部署 root）
  tar -czf "$w/ssh-authorized-keys.tgz" -C / root/.ssh/authorized_keys home/china-proxy/.ssh/authorized_keys home/nasbackup/.ssh/authorized_keys 2>/dev/null || true
  [ -d /root/deploy-bak ] && tar -czf "$w/root-deploy-bak.tgz" -C /root deploy-bak
  crontab -l -u root > "$w/crontab-root.txt" 2>/dev/null || true
  date +%Y-%m-%dT%H:%M:%S%z > "$w/exported-at.txt"
  chown -R root:"$NB_USER" "$w"; chmod 0750 "$w"; find "$w" -type f -exec chmod 0640 {} +
  rm -rf "$OUT/files.old"; mv "$OUT/files" "$OUT/files.old"; mv "$w" "$OUT/files"; rm -rf "$OUT/files.old"
  log files "ok"
}

do_app() {
  local name w t
  name="$(date +%Y%m%d-%H%M)"; w="$WORK/app-$name"
  rm -rf "$w"; install -d -o "$NB_USER" "$w"
  record_counts public,h "" > "$w/counts.tsv"
  as_nb pg_dump -Fc --compress=zstd:3 -N mds -f "$w/app.dump"
  for t in $APP_EXTRA_TABLES; do
    as_nb pg_dump -Fc --compress=zstd:3 -t "$t" -f "$w/extra-${t//[^A-Za-z0-9_.]/_}.dump"
  done
  for t in "$w"/*.dump; do as_nb pg_restore -l "$t" >/dev/null || die "corrupt $t"; done
  publish "$w" "$OUT/app/$name"
  keep_newest "$OUT/app" "$APP_KEEP"
  log app "ok $name $(du -sh "$OUT/app/$name" | cut -f1)"
}

do_core() {
  local name w args=() t
  name="$(date +%Y%m%d)"; w="$WORK/core-$name"
  rm -rf "$w"; install -d -o "$NB_USER" "$w"
  for t in $CORE_EXCLUDE_DATA; do args+=(--exclude-table-data="mds.$t"); done
  record_counts mds "$CORE_EXCLUDE_DATA" > "$w/counts.tsv"
  as_nb pg_dump -Fc --compress=zstd:3 -n mds "${args[@]}" -f "$w/mds-core.dump"
  as_nb pg_restore -l "$w/mds-core.dump" >/dev/null || die "corrupt mds-core dump"
  publish "$w" "$OUT/core/$name"
  keep_newest "$OUT/core" "$CORE_KEEP"
  log core "ok $name $(du -sh "$OUT/core/$name" | cut -f1)"
}

basebackup() { # $1=目录 $2=参照 manifest（空=全量）
  local extra=()
  [ -n "$2" ] && extra=(--incremental="$2")
  as_nb pg_basebackup -D "$1" -Ft --compress=client-zstd:level=3 -X stream \
    --checkpoint=spread --max-rate="$PHYS_MAX_RATE" --label="nas-$(basename "$1")" "${extra[@]}"
}

do_physical() {
  local mode=incr name w last="$STATE/last_manifest" lastfull=0
  [ -s "$last" ] || mode=full
  [ "${1:-}" = --full ] && mode=full
  [ -f "$STATE/last_full_at" ] && lastfull="$(cat "$STATE/last_full_at")"
  # 每月第一个周日自动全量（距上次全量超过 20 天），让增量链定期重新起头
  if [ "$(date +%u)" = 7 ] && [ "$(date +%-d)" -le 7 ] && [ $(( $(date +%s) - lastfull )) -gt $(( 20 * 86400 )) ]; then mode=full; fi
  name="$(date +%Y%m%d-%H%M)"

  if [ "$mode" = incr ]; then
    [ "$(free_gb)" -ge "$INCR_MIN_FREE_GB" ] || die "only $(free_gb)GB free, need ${INCR_MIN_FREE_GB}GB for incremental"
    w="$WORK/phys-$name-incr"; rm -rf "$w"
    if ! basebackup "$w" "$last"; then
      # 常见原因：WAL summary 超过 wal_summary_keep_time（setup 设为 21 天）没做增量，改做全量开新链
      log physical "incremental failed, falling back to full"; rm -rf "$w"; mode=full
    fi
  fi
  if [ "$mode" = full ]; then
    [ "$(free_gb)" -ge "$FULL_MIN_FREE_GB" ] || die "only $(free_gb)GB free, need ${FULL_MIN_FREE_GB}GB for full"
    w="$WORK/phys-$name-full"; rm -rf "$w"
    basebackup "$w" "" || { rm -rf "$w"; die "full basebackup failed"; }
    date +%s > "$STATE/last_full_at"
  fi
  # pg_basebackup 的 -Z 不压 pg_wal.tar，自己补压，免得跨境传原始 WAL
  [ -f "$w/pg_wal.tar" ] && as_nb zstd -q -3 --rm "$w/pg_wal.tar"
  install -m 0640 -o "$NB_USER" -g "$NB_USER" "$w/backup_manifest" "$last.new"
  publish "$w" "$OUT/physical/$name-$mode"
  mv "$last.new" "$last"
  # 按天数清理（群晖已拉走）；当前最新一份永不删，保证下次增量有参照
  local d ts cutoff
  cutoff=$(( $(date +%s) - PHYS_KEEP_DAYS * 86400 ))
  for d in "$OUT"/physical/*/; do
    d="${d%/}"; [ "$d" = "$OUT/physical/$name-$mode" ] && continue
    ts="$(date -d "$(basename "$d" | cut -c1-8)" +%s 2>/dev/null)" || continue
    [ "$ts" -lt "$cutoff" ] && rm -rf "$d"
  done
  log physical "ok $name-$mode $(du -sh "$OUT/physical/$name-$mode" | cut -f1); free $(free_gb)GB"
}

MODE="${1:-}"
[ "$(id -u)" = 0 ] || die "must run as root"
prepare
exec 9>"$STATE/$MODE.lock"
flock -n 9 || { log "$MODE" "previous run still in progress, skipped"; exit 0; }
case "$MODE" in
  files) do_files ;;
  app) do_app ;;
  core) do_core ;;
  physical) do_physical "${2:-}" ;;
  *) echo "usage: $0 {files|app|core|physical [--full]}" >&2; exit 2 ;;
esac
