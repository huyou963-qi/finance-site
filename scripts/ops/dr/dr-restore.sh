#!/usr/bin/env bash
# 灾难恢复：在一台全新的 Ubuntu 22.04 上，用群晖备份把生产服务器恢复到「可以接收部署」的状态。
# 之后照常用 GitHub Actions 部署（或 --tarball 指定本地打好的包）即可上线。完整流程：docs/OPS_DISASTER_RECOVERY.md
#
# 用法（root）：
#   bash dr-restore.sh --bundle /root/restore                 # 生产恢复
#   bash dr-restore.sh --bundle /root/restore --rehearsal     # 演练：清空发信/支付/OAuth 密钥，关闭 cron，不动防火墙
#   bash dr-restore.sh --bundle /root/restore --physical      # 用物理备份链恢复整库（含大表）；默认用逻辑备份
#   ... --tarball /root/deploy.tar.gz --deps-tarball /root/deploy-deps.tar.gz   # 恢复完直接用本地包发布
#
# --bundle 目录结构就是群晖 /volume1/db-backup 的结构（可以只拷需要的部分）：
#   files/current/{env.local, etc-nginx.tgz, etc-letsencrypt.tgz, crontab-root.txt, ssh-authorized-keys.tgz, ...}
#   app/<YYYYmmdd-HHMM>/{app.dump, extra-*.dump}      取最新一份
#   core/<YYYYmmdd>/mds-core.dump                     取最新一份
#   physical/<...>-full, <...>-incr                   --physical 时取最新全量 + 其后增量
# 幂等：每一步都可以重跑。

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export TZ=Asia/Shanghai

BUNDLE="" REHEARSAL=0 PHYSICAL=0 TARBALL="" DEPS_TARBALL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --bundle) BUNDLE="$2"; shift 2 ;;
    --rehearsal) REHEARSAL=1; shift ;;
    --physical) PHYSICAL=1; shift ;;
    --tarball) TARBALL="$2"; shift 2 ;;
    --deps-tarball) DEPS_TARBALL="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ "$(id -u)" = 0 ] || { echo "must run as root" >&2; exit 1; }
[ -d "$BUNDLE/files/current" ] || { echo "--bundle must contain files/current (群晖 db-backup 的结构)" >&2; exit 1; }
FILES="$BUNDLE/files/current"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED=/opt/finance-site-shared
PG_VER=17
PGDATA="/var/lib/postgresql/$PG_VER/main"
NODE_MAJOR=20

step() { echo; echo "==== [$(date '+%T')] $*"; }
latest() { ls -1d "$1"/*/ 2>/dev/null | grep -v '\.rsync-partial' | sort | tail -1 | sed 's#/$##'; }
psql_su() { sudo -u postgres psql -X -v ON_ERROR_STOP=1 -At "$@"; }

# ---------------------------------------------------------------- 1. 系统包
step "1/8 系统包（PostgreSQL $PG_VER、Node $NODE_MAJOR、nginx、pm2、certbot）"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release sudo rsync zstd util-linux git unzip \
  nginx certbot python3-certbot-nginx python3-pip fonts-noto-cjk sysstat cron logrotate openssh-server >/dev/null
if [ ! -f /etc/apt/sources.list.d/pgdg.list ]; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
fi
if [ ! -f /etc/apt/sources.list.d/nodesource.list ]; then
  install -d /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
fi
apt-get update -qq
apt-get install -y -qq "postgresql-$PG_VER" "postgresql-contrib" nodejs >/dev/null
command -v pm2 >/dev/null || npm install -g --silent pm2@7
pm2 ping >/dev/null 2>&1 || true   # 首次运行会打印一大段横幅，先在这里吞掉
timedatectl set-timezone Asia/Shanghai 2>/dev/null || ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
echo "node $(node -v), pm2 $(pm2 -v 2>/dev/null | tail -1), $(psql --version)"

# 2G swap（生产机 4G 内存，构建/回填时靠它兜底）；容器里没有 swapon 权限就跳过
if [ "$REHEARSAL" = 0 ] && ! swapon --show | grep -q .; then
  [ -f /swapfile ] || { fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null; }
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------------------------------------------------------------- 2. 环境变量
step "2/8 共享目录与 .env.local"
install -d -m 0755 "$SHARED" "$SHARED/logs" "$SHARED/.data" "$SHARED/.next-static-archive"
install -m 0600 "$FILES/env.local" "$SHARED/.env.local"
if [ "$REHEARSAL" = 1 ]; then
  # 演练机绝不能用生产身份对外发信、收款、回调第三方：清空这些变量
  sed -i -E \
    -e 's/^(SMTP_[A-Z_]*|ZPAY_PID|ZPAY_KEY|ARTICLE_OAUTH_CLIENTS|WEEKLY_REPORT_INGEST_TOKEN|DATA_LAG_[A-Z_]*WEBHOOK[A-Z_]*|ERROR_REPORT_[A-Z_]*|[A-Z_]*SLACK[A-Z_]*)=.*/\1=/' \
    -e 's/^ZPAY_ENABLED=.*/ZPAY_ENABLED=false/' \
    -e 's#^APP_BASE_URL=.*#APP_BASE_URL=http://localhost#' \
    -e 's#^(CHINA_OFFICIAL_PROXY_URL|CENSUS_FILE_PROXY_URL|WORLD_BANK_PROXY_URL)=.*#\1=#' \
    "$SHARED/.env.local"
  echo "rehearsal: cleared SMTP/ZPAY/OAuth/webhook/proxy variables"
fi
# DATABASE_URL → 角色、口令、库名（口令可能是 URL 编码的）
read -r DB_USER DB_PASS DB_NAME < <(python3 - "$SHARED/.env.local" <<'PY'
import sys, re, urllib.parse
for line in open(sys.argv[1], encoding="utf-8"):
    m = re.match(r'\s*DATABASE_URL\s*=\s*["\']?([^"\'\s]+)', line)
    if m:
        u = urllib.parse.urlparse(m.group(1))
        print(urllib.parse.unquote(u.username or ""), urllib.parse.unquote(u.password or ""), u.path.lstrip("/").split("?")[0])
        break
PY
)
[ -n "$DB_USER" ] && [ -n "$DB_NAME" ] || { echo "cannot parse DATABASE_URL from env.local" >&2; exit 1; }
echo "database: $DB_NAME owner: $DB_USER"

# ---------------------------------------------------------------- 3. 数据库
step "3/8 PostgreSQL 恢复（$( [ "$PHYSICAL" = 1 ] && echo 物理备份链 || echo 逻辑备份 )）"
systemctl enable --now postgresql >/dev/null 2>&1 || service postgresql start
if [ "$PHYSICAL" = 1 ]; then
  all="$(ls -1d "$BUNDLE"/physical/*-full "$BUNDLE"/physical/*-incr 2>/dev/null | sort)"
  full="$(echo "$all" | grep -- '-full$' | tail -1)"
  [ -n "$full" ] || { echo "no full physical backup in bundle" >&2; exit 1; }
  mapfile -t chain < <(echo "$all" | awk -v f="$full" '$0 >= f')
  work=/var/tmp/dr-physical; rm -rf "$work"; mkdir -p "$work"
  plain=()
  for i in "${!chain[@]}"; do
    d="$work/b$i"; mkdir -p "$d/pg_wal"
    tar --zstd -xf "${chain[$i]}/base.tar.zst" -C "$d"
    if [ -f "${chain[$i]}/pg_wal.tar.zst" ]; then tar --zstd -xf "${chain[$i]}/pg_wal.tar.zst" -C "$d/pg_wal"
    elif [ -f "${chain[$i]}/pg_wal.tar" ]; then tar -xf "${chain[$i]}/pg_wal.tar" -C "$d/pg_wal"; fi
    cp "${chain[$i]}/backup_manifest" "$d/"
    plain+=("$d")
  done
  echo "chain: $(for c in "${chain[@]}"; do basename "$c"; done | tr '\n' ' ')"
  systemctl stop postgresql 2>/dev/null || service postgresql stop
  mv "$PGDATA" "$PGDATA.pre-dr-$(date +%s)"
  if [ "${#plain[@]}" -gt 1 ]; then
    "/usr/lib/postgresql/$PG_VER/bin/pg_combinebackup" -o "$PGDATA" "${plain[@]}"
  else
    mv "${plain[0]}" "$PGDATA"
  fi
  "/usr/lib/postgresql/$PG_VER/bin/pg_verifybackup" -q "$PGDATA"
  chown -R postgres:postgres "$PGDATA"; chmod 0700 "$PGDATA"
  rm -rf "$work"
  systemctl start postgresql 2>/dev/null || service postgresql start
  for _ in $(seq 1 120); do sudo -u postgres pg_isready -q && break; sleep 5; done
  # 物理备份自带角色与口令；以 .env.local 为准再设一次口令，避免两边不一致
  sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -v u="$DB_USER" -v p="$DB_PASS" \
    -c "alter role :\"u\" password :'p'"
else
  app="$(latest "$BUNDLE/app")"; core="$(latest "$BUNDLE/core")"
  [ -f "$app/app.dump" ] && [ -f "$core/mds-core.dump" ] || { echo "bundle needs app/<ts>/app.dump and core/<date>/mds-core.dump" >&2; exit 1; }
  echo "using $(basename "$app") (app) + $(basename "$core") (core)"
  db_exists="$(psql_su -c "select 1 from pg_database where datname='$DB_NAME'")"
  restored=""
  [ -n "$db_exists" ] && restored="$(psql_su -d "$DB_NAME" -c "select 1 where to_regclass('public._prisma_migrations') is not null and to_regclass('mds.\"MacroObservation\"') is not null")"
  if [ -n "$restored" ]; then
    echo "database $DB_NAME already restored: skipping (drop it first for a clean restore)"
  else
  # 上次恢复中途失败留下的半成品库（只有本脚本会在新机器上建它）：删掉重来（演练发现）
  [ -n "$db_exists" ] && { echo "dropping incomplete database $DB_NAME from a previous failed run"; sudo -u postgres dropdb "$DB_NAME"; }
  sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -v u="$DB_USER" -v p="$DB_PASS" <<'SQL'
select format('create role %I login password %L', :'u', :'p') where not exists (select 1 from pg_roles where rolname = :'u') \gexec
SQL
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  # 备份通常放在 /root 下，postgres 用户读不到：复制到它可读的临时目录（演练发现）
  dumps=/var/tmp/dr-dumps; rm -rf "$dumps"; install -d -o postgres -m 0700 "$dumps"
  install -o postgres -m 0600 "$app"/*.dump "$core/mds-core.dump" "$dumps/"
  # 以属主身份恢复，表/序列都归 $DB_USER 所有，和生产一致
  sudo -u postgres pg_restore -d "$DB_NAME" --no-owner --no-privileges --role="$DB_USER" --exit-on-error -j 2 "$dumps/app.dump"
  sudo -u postgres pg_restore -d "$DB_NAME" --no-owner --no-privileges --role="$DB_USER" --exit-on-error -j 2 "$dumps/mds-core.dump"
  # 人工裁定表：app 层每天一份，比每周的 core 新
  for x in "$dumps"/extra-*.dump; do
    [ -f "$x" ] || continue
    t="$(basename "$x" .dump)"; t="${t#extra-}"
    sudo -u postgres psql -X -q -d "$DB_NAME" -c "truncate $t"
    sudo -u postgres pg_restore -d "$DB_NAME" --data-only --no-owner --role="$DB_USER" --exit-on-error "$x"
  done
  sudo -u postgres psql -X -q -d "$DB_NAME" -c "analyze"
  rm -rf "$dumps"
  fi
fi
psql_su -c "alter system set timezone = 'Asia/Shanghai'" -c "alter system set log_timezone = 'Asia/Shanghai'" \
  -c "alter system set summarize_wal = on" -c "alter system set wal_summary_keep_time = '21d'" -c "select pg_reload_conf()" >/dev/null
n_user="$(psql_su -d "$DB_NAME" -c 'select count(*) from public."User"' 2>/dev/null || true)"
n_obs="$(psql_su -d "$DB_NAME" -c 'select count(*) from mds."MacroObservation"' 2>/dev/null || true)"
n_bar="$(psql_su -d "$DB_NAME" -c 'select count(*) from mds.equity_daily_bar' 2>/dev/null || true)"
echo "rows: User=${n_user:-?}, MacroObservation=${n_obs:-?}, equity_daily_bar=${n_bar:-?}"
# 恢复必须真的拿到数据，否则立即停下（演练发现：空库也曾一路「成功」到底）
[ "${n_user:-0}" -gt 0 ] && [ "${n_obs:-0}" -gt 0 ] || { echo "restore check failed: core tables are empty" >&2; exit 1; }

# ---------------------------------------------------------------- 4. nginx + 证书
step "4/8 nginx 配置与 HTTPS 证书"
tar -xzf "$FILES/etc-nginx.tgz" -C /etc
[ -f "$FILES/etc-letsencrypt.tgz" ] && tar -xzf "$FILES/etc-letsencrypt.tgz" -C /etc
# 这两个文件由部署脚本安装；首次部署前先放占位，保证 nginx -t 能过
[ -f /etc/nginx/snippets/finance-site-zpay-notify.conf ] || : > /etc/nginx/snippets/finance-site-zpay-notify.conf
[ -f /etc/nginx/conf.d/finance-site-upstream.conf ] || \
  printf 'upstream finance_site_app {\n    server 127.0.0.1:3000;\n    keepalive 16;\n}\n' > /etc/nginx/conf.d/finance-site-upstream.conf
rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/*.bak*
nginx -t
systemctl enable --now nginx >/dev/null 2>&1 || service nginx start
systemctl reload nginx 2>/dev/null || service nginx reload

# ---------------------------------------------------------------- 5. 账号与 SSH 公钥
step "5/8 账号与 SSH 公钥（china-proxy 反向代理、root 部署 key）"
keys=/var/tmp/dr-keys; rm -rf "$keys"; mkdir -p "$keys"
[ -f "$FILES/ssh-authorized-keys.tgz" ] && tar -xzf "$FILES/ssh-authorized-keys.tgz" -C "$keys"
if ! id china-proxy >/dev/null 2>&1; then useradd --create-home --shell /bin/bash china-proxy; passwd -l china-proxy >/dev/null; fi
if [ -f "$keys/home/china-proxy/.ssh/authorized_keys" ]; then
  install -d -m 0700 -o china-proxy -g china-proxy /home/china-proxy/.ssh
  install -m 0600 -o china-proxy -g china-proxy "$keys/home/china-proxy/.ssh/authorized_keys" /home/china-proxy/.ssh/authorized_keys
fi
if [ -f "$keys/root/.ssh/authorized_keys" ]; then
  install -d -m 0700 /root/.ssh
  # 合并而不是覆盖：保留这台新机器原有的登录 key
  touch /root/.ssh/authorized_keys
  sort -u /root/.ssh/authorized_keys "$keys/root/.ssh/authorized_keys" -o /root/.ssh/authorized_keys
  chmod 0600 /root/.ssh/authorized_keys
fi
rm -rf "$keys"

# ---------------------------------------------------------------- 6. 定时任务
step "6/8 定时任务"
if [ "$REHEARSAL" = 1 ]; then
  # 演练机关掉 cron：生产 cron 会跑计费对账、数据抓取，演练里不能触发
  systemctl disable --now cron >/dev/null 2>&1 || service cron stop || true
  echo "rehearsal: cron disabled"
else
  crontab -u root "$FILES/crontab-root.txt"
  systemctl enable --now cron >/dev/null 2>&1 || service cron start
  # /etc/cron.d/finance-site-* 由首次部署安装；nas-backup 由 hk-nas-backup-setup.sh 安装（见手册）
fi

# ---------------------------------------------------------------- 7. pm2 开机自启 + 防火墙
step "7/8 pm2 开机自启与防火墙"
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || echo "pm2 startup skipped (no systemd?)"
if [ "$REHEARSAL" = 0 ] && command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null
fi

# ---------------------------------------------------------------- 8. 发布
step "8/8 发布"
if [ -n "$TARBALL" ]; then
  cp "$TARBALL" "$SHARED/deploy.tar.gz"
  [ -n "$DEPS_TARBALL" ] && cp "$DEPS_TARBALL" "$SHARED/deploy-deps.tar.gz"
  rm -rf /tmp/finance-deploy-script; mkdir -p /tmp/finance-deploy-script
  tar -xzf "$SHARED/deploy.tar.gz" -C /tmp/finance-deploy-script scripts/ops/deploy-release.sh scripts/ops/install-release-deps.sh
  TARBALL="$SHARED/deploy.tar.gz" DEPLOY_PATH=/opt/finance-site sh /tmp/finance-deploy-script/scripts/ops/deploy-release.sh
  [ "$REHEARSAL" = 1 ] && systemctl disable --now cron >/dev/null 2>&1 || true
else
  cat <<EOF
服务器已就绪，等待发布。下一步（见 docs/OPS_DISASTER_RECOVERY.md）：
  1. GitHub 仓库 Settings → Secrets：DEPLOY_HOST 改成本机 IP；DEPLOY_SSH_KEY 对应的公钥已随备份恢复到 /root/.ssh/authorized_keys
  2. Actions → Deploy to production → Run workflow（首次会上传依赖包，约多花几分钟）
EOF
fi
echo; echo "DR restore finished at $(date '+%F %T')"
