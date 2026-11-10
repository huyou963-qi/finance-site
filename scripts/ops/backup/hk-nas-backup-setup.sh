#!/usr/bin/env bash
# 香港生产机一次性配置：本机定时生成备份 → 群晖只读 rsync 拉取（香港不持有任何群晖凭据）。
# 幂等，可重复执行。以 root 运行（与 hk-nas-backup-produce.sh 放在同一目录）：
#
#   bash hk-nas-backup-setup.sh                                      # 账号 / 角色 / cron
#   bash hk-nas-backup-setup.sh --pubkey "ssh-ed25519 AAAA... nas"   # 同时登记群晖公钥
#
# 做的事：
#   1. Linux 用户 nasbackup；群晖那把 key 只能只读 rsync /var/backups/nas-export，不能开 shell、不能转发端口。
#   2. PostgreSQL 角色 nasbackup：LOGIN + REPLICATION + pg_read_all_data，unix socket peer 认证（无口令，不能写/DROP）。
#   3. summarize_wal=on（PG17 增量物理备份需要；reload 生效，不重启）。
#   4. 安装 /usr/local/sbin/nas-backup-produce.sh 与 /etc/cron.d/finance-nas-backup。
# 说明：docs/OPS_NAS_BACKUP.md

set -euo pipefail

PUBKEY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pubkey) PUBKEY="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ "$(id -u)" = 0 ] || { echo "must run as root" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NB=nasbackup
DB_NAME=finance
EXPORT_DIR=/var/backups/nas-export
psql_su() { sudo -u postgres env PGOPTIONS="-c client_min_messages=warning" psql -X -v ON_ERROR_STOP=1 -At "$@"; }

# ---------- 1. Linux 用户 + 受限 key ----------
if ! id "$NB" >/dev/null 2>&1; then
  # 需要可执行 shell 以运行 forced command（rrsync）；交互登录由 authorized_keys 的 restrict 禁止
  useradd --system --create-home --home-dir "/home/$NB" --shell /bin/sh "$NB"
  echo "created user $NB"
fi
passwd -l "$NB" >/dev/null
install -d -m 0700 -o "$NB" -g "$NB" "/home/$NB/.ssh"
AK="/home/$NB/.ssh/authorized_keys"
touch "$AK"
OPTS='restrict,command="/usr/bin/rrsync -ro '"$EXPORT_DIR"'"'
# 已登记的 key 统一刷成当前选项（早期版本允许过端口转发）
awk -v o="$OPTS" '{ for (i=1;i<=NF;i++) if ($i ~ /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-)/) { s=$i; for (j=i+1;j<=NF;j++) s=s" "$j; print o" "s; break } }' "$AK" > "$AK.tmp"
if [ -n "$PUBKEY" ]; then
  case "$PUBKEY" in ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*) ;; *) echo "pubkey looks invalid" >&2; exit 2 ;; esac
  KEYBODY="$(echo "$PUBKEY" | awk '{print $2}')"
  grep -v -F "$KEYBODY" "$AK.tmp" > "$AK.tmp2" || true
  echo "$OPTS $PUBKEY" >> "$AK.tmp2"; mv "$AK.tmp2" "$AK.tmp"
  echo "registered NAS public key"
fi
mv "$AK.tmp" "$AK"; chown "$NB:$NB" "$AK"; chmod 0600 "$AK"

# ---------- 2. 数据库角色（peer 认证，与 Linux 用户同名） ----------
if [ -z "$(psql_su -c "select 1 from pg_roles where rolname='$NB'")" ]; then
  psql_su -c "create role $NB login replication" >/dev/null
  echo "created role $NB"
fi
psql_su -c "alter role $NB login replication nosuperuser nocreatedb nocreaterole password null" >/dev/null
psql_su -c "grant pg_read_all_data to $NB" >/dev/null
psql_su -c "grant connect on database $DB_NAME to $NB" >/dev/null
# 早期版本用过带口令的 nas_backup 角色，下线
if [ -n "$(psql_su -c "select 1 from pg_roles where rolname='nas_backup'")" ]; then
  psql_su -c "revoke all on database $DB_NAME from nas_backup" >/dev/null
  psql_su -c "drop role nas_backup" >/dev/null
  echo "dropped legacy role nas_backup"
fi
rm -f /root/nas-backup/db-password

# ---------- 3. 增量物理备份需要 WAL summarizer ----------
if [ "$(psql_su -c 'show summarize_wal')" != "on" ]; then
  psql_su -c "alter system set summarize_wal = on" >/dev/null
  psql_su -c "select pg_reload_conf()" >/dev/null
  echo "enabled summarize_wal (reload, no restart)"
fi
# 每周才做一次增量，默认 10 天的 summary 保留期太紧，放到 21 天（summary 文件很小）
if [ "$(psql_su -c 'show wal_summary_keep_time')" != "21d" ]; then
  psql_su -c "alter system set wal_summary_keep_time = '21d'" >/dev/null
  psql_su -c "select pg_reload_conf()" >/dev/null
  echo "set wal_summary_keep_time=21d"
fi

# ---------- 4. 生成脚本 + cron ----------
install -m 0755 "$SCRIPT_DIR/hk-nas-backup-produce.sh" /usr/local/sbin/nas-backup-produce.sh
install -d -m 0750 -o root -g "$NB" "$EXPORT_DIR"
# 早期版本把文件直接放在导出目录根下、并导出过 pgpass
find "$EXPORT_DIR" -mindepth 1 -maxdepth 1 -type f -delete
rm -f /etc/cron.d/finance-nas-backup-export /usr/local/sbin/nas-backup-export.sh

cat > /etc/cron.d/finance-nas-backup <<'CRON'
# 本机生成备份到 /var/backups/nas-export，群晖只读 rsync 拉取。见 docs/OPS_NAS_BACKUP.md
# 业务表每天；mds 核心与物理备份每周日（物理每月第一个周日为全量）
55 2 * * * root /usr/local/sbin/nas-backup-produce.sh files    >> /var/log/nas-backup.log 2>&1
5 3 * * *  root /usr/local/sbin/nas-backup-produce.sh app      >> /var/log/nas-backup.log 2>&1
20 3 * * 0 root /usr/local/sbin/nas-backup-produce.sh core     >> /var/log/nas-backup.log 2>&1
40 3 * * 0 root /usr/local/sbin/nas-backup-produce.sh physical >> /var/log/nas-backup.log 2>&1
CRON
chmod 0644 /etc/cron.d/finance-nas-backup

cat > /etc/logrotate.d/finance-nas-backup <<'ROT'
/var/log/nas-backup.log {
  monthly
  rotate 6
  compress
  missingok
  notifempty
}
ROT

/usr/local/sbin/nas-backup-produce.sh files >/dev/null
echo "done. summarize_wal=$(psql_su -c 'show summarize_wal'); NAS keys registered: $(grep -c . "$AK" || true)"
