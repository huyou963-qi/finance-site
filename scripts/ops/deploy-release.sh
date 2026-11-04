#!/bin/sh
# 零停机发布：新版本解压到独立 release 目录，在空闲端口拉起并健康检查后，
# 再切换 nginx upstream，最后停掉旧进程。网站在切换前始终由旧进程提供服务。
#
# 用法（由 GitHub Actions SSH 调用；也可手动）：
#   TARBALL=/opt/finance-site/deploy.tar.gz sh scripts/ops/deploy-release.sh
#
# 布局：
#   /opt/finance-site              -> 当前 release 的符号链接（供 cron / 运维 cd）
#   /opt/finance-site-releases/    -> release-* 不可变目录（保留最近 2 个）
#   /opt/finance-site-shared/      -> .env.local / .data / logs / 静态 archive / 端口状态
set -eu

DEPLOY_PATH="${DEPLOY_PATH:-/opt/finance-site}"
RELEASE_ROOT="${RELEASE_ROOT:-/opt/finance-site-releases}"
SHARED="${SHARED_PATH:-/opt/finance-site-shared}"
TARBALL="${TARBALL:-$DEPLOY_PATH/deploy.tar.gz}"
KEEP_RELEASES="${KEEP_WEB_RELEASES:-2}"
APP_SLOT_FILE="$SHARED/active-slot"
PORT_FILE="$SHARED/active-port"
UPSTREAM_CONF=/etc/nginx/conf.d/finance-site-upstream.conf
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/finance-site}"

WORKER_LOCK=/tmp/finance-data-worker.lock
CALENDAR_LOCK=/tmp/finance-sync-calendar.lock
SECTOR_LOCK=/tmp/finance-sector-daily-disclosures.lock
BILLING_LOCK=/tmp/finance-billing.lock

log() { echo "[deploy-release] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

command -v flock >/dev/null 2>&1 || die "需要 flock"
command -v pm2 >/dev/null 2>&1 || die "需要 pm2"
command -v curl >/dev/null 2>&1 || die "需要 curl"

[ -f "$TARBALL" ] || die "找不到 tarball: $TARBALL"

mkdir -p "$RELEASE_ROOT" "$SHARED" "$SHARED/.next-static-archive" "$SHARED/logs"

# --- 首次：把仍是实体目录的 /opt/finance-site 里的共享态拷到 shared（不移动、不停站）---
bootstrap_shared_from_live() {
  live="$1"
  [ -d "$live" ] || return 0
  if [ -f "$live/.env.local" ] && [ ! -f "$SHARED/.env.local" ]; then
    log "复制 .env.local -> shared"
    cp -a "$live/.env.local" "$SHARED/.env.local"
  fi
  if [ -d "$live/.data" ] && [ ! -e "$SHARED/.data" ]; then
    log "迁移 .data -> shared（rename，站点进程已打开的句柄不受影响）"
    mv "$live/.data" "$SHARED/.data"
    ln -sfn "$SHARED/.data" "$live/.data"
  fi
  if [ -d "$live/logs" ] && [ ! -e "$SHARED/logs/.bootstrapped" ]; then
    # 合并日志到 shared，再回链，避免 cron 写到即将被替换的实体目录
    if [ -L "$live/logs" ]; then
      :
    else
      log "合并 logs -> shared"
      mkdir -p "$SHARED/logs"
      # 尽量移动大文件；失败则保留原目录
      cp -an "$live/logs/." "$SHARED/logs/" 2>/dev/null || true
      touch "$SHARED/logs/.bootstrapped"
    fi
  fi
  if [ -d "$live/.next-static-archive" ]; then
    cp -an "$live/.next-static-archive/." "$SHARED/.next-static-archive/" 2>/dev/null || true
  fi
  if [ ! -f "$PORT_FILE" ]; then
    echo "3000" >"$PORT_FILE"
  fi
  if [ ! -f "$APP_SLOT_FILE" ]; then
    echo "a" >"$APP_SLOT_FILE"
  fi
}

link_shared_into_release() {
  release="$1"
  [ -f "$SHARED/.env.local" ] || die "shared 缺少 .env.local"
  ln -sfn "$SHARED/.env.local" "$release/.env.local"
  mkdir -p "$SHARED/.data"
  ln -sfn "$SHARED/.data" "$release/.data"
  mkdir -p "$SHARED/logs"
  ln -sfn "$SHARED/logs" "$release/logs"
  ln -sfn "$SHARED/.next-static-archive" "$release/.next-static-archive"
}

ensure_nginx_upstream() {
  port="$1"
  cat >"$UPSTREAM_CONF" <<NGX
# Managed by scripts/ops/deploy-release.sh — do not edit by hand.
upstream finance_site_app {
    server 127.0.0.1:${port};
    keepalive 16;
}
NGX
  if [ -f "$NGINX_SITE" ]; then
    if grep -q 'proxy_pass http://127\.0\.0\.1:3000' "$NGINX_SITE"; then
      log "将 nginx 站点 proxy_pass 改为 upstream finance_site_app"
      cp -a "$NGINX_SITE" "$NGINX_SITE.bak.pre-zero-downtime"
      # 只替换 location 内常见的直连 3000，保留其它监听
      sed -i 's#proxy_pass http://127\.0\.0\.1:3000;#proxy_pass http://finance_site_app;#' "$NGINX_SITE"
    fi
    if ! grep -q 'proxy_pass http://finance_site_app' "$NGINX_SITE"; then
      die "nginx 站点未使用 finance_site_app upstream，请检查 $NGINX_SITE"
    fi
  else
    log "警告: 找不到 $NGINX_SITE，跳过 proxy_pass 改写（仍写入 upstream 文件）"
  fi
  nginx -t
  systemctl reload nginx
}

# 部署 smoke：首页、DB health、系统模板、行情页、匿名 auth/me、宏观 instruments BFF。
# 成功返回 0；失败打印原因并返回 1（调用方决定是否回滚）。
deploy_smoke_once() {
  base="$1"
  curl -fsS -o /dev/null --connect-timeout 2 --max-time 5 "$base/" || {
    log "smoke 失败: GET /"
    return 1
  }
  curl -fsS -o /tmp/finance-deploy-health.json --connect-timeout 2 --max-time 5 "$base/api/health" \
    && grep -q '"ok":true' /tmp/finance-deploy-health.json || {
    log "smoke 失败: GET /api/health"
    return 1
  }
  prefs=$(curl -sS --connect-timeout 2 --max-time 5 -o /tmp/macro-prefs-check.json -w "%{http_code}" \
    "$base/api/tools/macro-chart-prefs" || true)
  if [ "$prefs" != "200" ] || ! grep -q '"builtinTemplateOverrides"' /tmp/macro-prefs-check.json; then
    log "smoke 失败: GET /api/tools/macro-chart-prefs (HTTP ${prefs:-none})"
    return 1
  fi
  markets=$(curl -sS --connect-timeout 2 --max-time 8 -o /dev/null -w "%{http_code}" \
    "$base/markets" || true)
  case "$markets" in
    2??|3??) ;;
    *)
      log "smoke 失败: GET /markets (HTTP ${markets:-none})"
      return 1
      ;;
  esac
  me=$(curl -sS --connect-timeout 2 --max-time 5 -o /tmp/finance-deploy-me.json -w "%{http_code}" \
    "$base/api/auth/me" || true)
  if [ "$me" != "401" ] || ! grep -q '"user":null' /tmp/finance-deploy-me.json; then
    log "smoke 失败: GET /api/auth/me 期望匿名 401+user:null (HTTP ${me:-none})"
    return 1
  fi
  instruments=$(curl -sS --connect-timeout 2 --max-time 8 -o /tmp/finance-deploy-instruments.json -w "%{http_code}" \
    "$base/api/data/instruments?kind=MACRO_SERIES&limit=1" || true)
  if [ "$instruments" != "200" ] || ! grep -q '"total"' /tmp/finance-deploy-instruments.json; then
    log "smoke 失败: GET /api/data/instruments 宏观 BFF (HTTP ${instruments:-none})"
    return 1
  fi
  return 0
}

# 轮询 smoke；默认 30 次 × 2s。成功返回 0。
deploy_smoke() {
  port="$1"
  base="http://127.0.0.1:${port}"
  log "部署 smoke $base ..."
  i=0
  while [ "$i" -lt 30 ]; do
    i=$((i + 1))
    if deploy_smoke_once "$base"; then
      log "部署 smoke 通过"
      return 0
    fi
    sleep 2
  done
  log "部署 smoke 失败"
  pm2 logs "finance-site-${CAND_SLOT}" --lines 60 --nostream || true
  pm2 logs "finance-site-${LIVE_SLOT}" --lines 40 --nostream || true
  return 1
}

# 切流后失败：nginx/符号链接/PM2 全部指回上一 release。
rollback_to_previous() {
  reason="${1:-post-switch smoke failed}"
  log "回滚到上一 artifact：$reason"
  if [ -z "${PREV_RELEASE:-}" ] || [ ! -d "$PREV_RELEASE" ]; then
    log "ERROR: 无可用上一 release（PREV_RELEASE=${PREV_RELEASE:-empty}），无法自动回滚"
    pm2 delete "$CAND_APP" >/dev/null 2>&1 || true
    return 1
  fi
  if command -v nginx >/dev/null 2>&1; then
    ensure_nginx_upstream "$PREV_PORT" || log "警告: nginx 回切失败"
  fi
  pm2 delete "$CAND_APP" >/dev/null 2>&1 || true
  pm2 delete "$PREV_APP" >/dev/null 2>&1 || true
  pm2 start "$PREV_RELEASE/node_modules/next/dist/bin/next" \
    --name "$PREV_APP" \
    --cwd "$PREV_RELEASE" \
    -- start -p "$PREV_PORT" || {
    log "ERROR: 无法拉起上一进程 $PREV_APP @ $PREV_PORT"
    return 1
  }
  if [ -L "$DEPLOY_PATH" ] || [ ! -e "$DEPLOY_PATH" ]; then
    ln -sfn "$PREV_RELEASE" "${DEPLOY_PATH}.nextlink"
    mv -Tf "${DEPLOY_PATH}.nextlink" "$DEPLOY_PATH"
  fi
  echo "$PREV_PORT" >"$PORT_FILE"
  echo "$PREV_SLOT" >"$APP_SLOT_FILE"
  pm2 save || true
  if deploy_smoke_once "http://127.0.0.1:${PREV_PORT}"; then
    log "已回滚到 $PREV_RELEASE（port=$PREV_PORT app=$PREV_APP），上一版 smoke 正常"
  else
    log "警告: 已切回上一 release，但 smoke 仍失败——请人工检查"
  fi
  return 0
}

# --- 解析当前 live 端口与 slot ---
LIVE_PATH="$DEPLOY_PATH"
if [ -L "$DEPLOY_PATH" ] || [ -d "$DEPLOY_PATH" ]; then
  bootstrap_shared_from_live "$(readlink -f "$DEPLOY_PATH" 2>/dev/null || echo "$DEPLOY_PATH")"
fi

OLD_PORT=$(cat "$PORT_FILE" 2>/dev/null || echo 3000)
case "$OLD_PORT" in
  3000) NEW_PORT=3001 ;;
  3001) NEW_PORT=3000 ;;
  *) NEW_PORT=3001; OLD_PORT=3000 ;;
esac

LIVE_SLOT=$(cat "$APP_SLOT_FILE" 2>/dev/null || echo a)
case "$LIVE_SLOT" in
  a) CAND_SLOT=b ;;
  b) CAND_SLOT=a ;;
  *) CAND_SLOT=b; LIVE_SLOT=a ;;
esac

LIVE_APP="finance-site-${LIVE_SLOT}"
CAND_APP="finance-site-${CAND_SLOT}"

log "live_port=$OLD_PORT cand_port=$NEW_PORT live_app=$LIVE_APP cand_app=$CAND_APP"

# --- 1) 不停站：解压到新 release ---
RELEASE_ID="release-$(date +%Y%m%d%H%M%S)-$$"
RELEASE_PATH="$RELEASE_ROOT/$RELEASE_ID"
mkdir -p "$RELEASE_PATH"
log "解压到 $RELEASE_PATH"
tar -xzf "$TARBALL" -C "$RELEASE_PATH"
rm -f "$TARBALL"

# 合并静态 archive，避免旧页面 chunk 404
if [ -d "$RELEASE_PATH/.next/static" ]; then
  mkdir -p "$SHARED/.next-static-archive"
  if [ -d "$SHARED/.next-static-archive" ]; then
    find "$SHARED/.next-static-archive" -type f -mtime +30 -delete 2>/dev/null || true
    find "$SHARED/.next-static-archive" -depth -mindepth 1 -type d -empty -delete 2>/dev/null || true
  fi
  # 若 live 仍有 archive，先吸收
  if [ -d "$DEPLOY_PATH/.next-static-archive" ] && [ ! -L "$DEPLOY_PATH/.next-static-archive" ]; then
    cp -an "$DEPLOY_PATH/.next-static-archive/." "$SHARED/.next-static-archive/" 2>/dev/null || true
  fi
  if [ -d "$DEPLOY_PATH/.next/static" ]; then
    cp -an "$DEPLOY_PATH/.next/static/." "$SHARED/.next-static-archive/" 2>/dev/null || true
  fi
  cp -an "$SHARED/.next-static-archive/." "$RELEASE_PATH/.next/static/" 2>/dev/null || true
  cp -an "$RELEASE_PATH/.next/static/." "$SHARED/.next-static-archive/" 2>/dev/null || true
fi

link_shared_into_release "$RELEASE_PATH"
[ -d "$RELEASE_PATH/.next" ] || die "release 缺少 .next"
[ -d "$RELEASE_PATH/node_modules" ] || die "release 缺少 node_modules"
[ -f "$RELEASE_PATH/package.json" ] || die "release 缺少 package.json"

# --- 2) 安装 cron / nginx 诊断等（不依赖停站）---
cd "$RELEASE_PATH"
install -m 0644 scripts/ops/finance-site-sector-regime.cron /etc/cron.d/finance-site-sector-regime
install -m 0644 scripts/ops/finance-site-sector-history.cron /etc/cron.d/finance-site-sector-history
install -m 0644 scripts/ops/finance-site-quant-monthly.cron /etc/cron.d/finance-site-quant-monthly
install -m 0644 scripts/ops/finance-site-ownership.cron /etc/cron.d/finance-site-ownership
install -m 0644 scripts/ops/finance-site-dera-insider.cron /etc/cron.d/finance-site-dera-insider
install -m 0644 scripts/ops/finance-site-gold-futures.cron /etc/cron.d/finance-site-gold-futures
install -m 0644 scripts/ops/finance-site-data.logrotate /etc/logrotate.d/finance-site-data
install -m 0644 scripts/ops/finance-site-billing.cron /etc/cron.d/finance-site-billing
install -m 0644 scripts/ops/finance-site-billing.logrotate /etc/logrotate.d/finance-site-billing
if command -v nginx >/dev/null 2>&1; then
  install -m 0644 scripts/ops/finance-site-zpay-notify.conf /etc/nginx/snippets/finance-site-zpay-notify.conf
  install -m 0644 scripts/ops/finance-site-asset-diagnostics.conf /etc/nginx/conf.d/finance-site-asset-diagnostics.conf
  install -m 0644 scripts/ops/finance-site-asset-diagnostics.logrotate /etc/logrotate.d/finance-site-assets
fi
chmod +x scripts/ops/host-diagnostics-snapshot.sh scripts/ops/host-diagnostics-boot.sh 2>/dev/null || true
chmod +x scripts/ops/sync-cron-checkout.sh scripts/ops/deploy-release.sh
if [ -f scripts/ops/prune-worker-releases.sh ]; then
  chmod +x scripts/ops/prune-worker-releases.sh
fi

# --- 3) 拿锁后再 migrate / data:apply / 切换 worker 检出（旧站仍在服务）---
log "等待 worker/calendar/sector/billing 锁..."
exec 8>"$WORKER_LOCK"
flock -w 1800 8 || die "等待 data-worker 锁超时"
exec 9>"$CALENDAR_LOCK"
flock -w 1800 9 || die "等待 sync-calendar 锁超时"
exec 7>"$SECTOR_LOCK"
flock -w 7200 7 || die "等待 sector disclosures 锁超时"
exec 6>"$BILLING_LOCK"
flock -w 180 6 || die "等待 billing 锁超时"
# sync-cron-checkout / prune-worker-releases 自己也会 flock；部署已持锁时必须跳过，
# 否则子进程对同一 lockfile 再抢排他锁会死锁（实测 #72 部署卡 30min、站点停服）。
export SYNC_CRON_CHECKOUT_LOCKED=1
export PRUNE_WORKER_RELEASES_LOCKED=1

log "db:migrate + data:apply（旧站仍在 $OLD_PORT 服务）"
npm run db:migrate
npm run data:apply -- --skip-migrate --skip-equity --skip-calendar --skip-backfill --skip-verify

log "同步独立调度器检出"
sh scripts/ops/sync-cron-checkout.sh "$RELEASE_PATH" /opt/finance-site-jp-data
if [ -f scripts/ops/prune-worker-releases.sh ]; then
  sh scripts/ops/prune-worker-releases.sh --apply --keep 5 || log "警告: worker release 清理失败（不阻断发布）"
fi
install -m 0644 scripts/ops/finance-site-data-scheduler.cron /etc/cron.d/finance-site-data-scheduler

# --- 4) 在空闲端口启动候选进程 ---
pm2 delete "$CAND_APP" >/dev/null 2>&1 || true
log "启动候选进程 $CAND_APP @ $NEW_PORT cwd=$RELEASE_PATH"
# PORT 必须进 pm2 环境；cwd 指向新 release
cd "$RELEASE_PATH"
# 直接调 next bin 并传 -p，避免 npm/pm2 丢 PORT 环境变量导致仍绑 3000 冲突。
pm2 start "$RELEASE_PATH/node_modules/next/dist/bin/next" \
  --name "$CAND_APP" \
  --cwd "$RELEASE_PATH" \
  -- start -p "$NEW_PORT"

# 切流前记下上一 artifact，供发布后 smoke 失败自动回滚。
PREV_PORT="$OLD_PORT"
PREV_SLOT="$LIVE_SLOT"
PREV_APP="$LIVE_APP"
PREV_RELEASE=""
if [ -e "$DEPLOY_PATH" ]; then
  PREV_RELEASE=$(readlink -f "$DEPLOY_PATH" 2>/dev/null || true)
fi

rollback_cand() {
  log "回滚：删除候选进程 $CAND_APP（流量仍在旧版 $PREV_PORT）"
  pm2 delete "$CAND_APP" >/dev/null 2>&1 || true
}
trap rollback_cand EXIT

deploy_smoke "$NEW_PORT" || die "新版本未通过切流前 smoke"

# --- 5) 切换 nginx，再停旧进程 ---
if command -v nginx >/dev/null 2>&1; then
  ensure_nginx_upstream "$NEW_PORT"
else
  die "未安装 nginx，无法零停机切流"
fi

log "停止旧进程 $LIVE_APP（流量已在 $NEW_PORT）"
pm2 delete "$LIVE_APP" >/dev/null 2>&1 || true
# 兼容历史单进程名 finance-site
if [ "$OLD_PORT" = "3000" ]; then
  if pm2 describe finance-site >/dev/null 2>&1; then
    pm2 delete finance-site >/dev/null 2>&1 || true
  fi
fi

# --- 6) 原子切换 /opt/finance-site 符号链接，供 cron 使用新代码 ---
log "切换 $DEPLOY_PATH -> $RELEASE_PATH"
if [ -L "$DEPLOY_PATH" ]; then
  ln -sfn "$RELEASE_PATH" "${DEPLOY_PATH}.nextlink"
  mv -Tf "${DEPLOY_PATH}.nextlink" "$DEPLOY_PATH"
elif [ -d "$DEPLOY_PATH" ]; then
  LEGACY="$RELEASE_ROOT/release-prelink-$(date +%Y%m%d%H%M%S)"
  log "首次迁移：实体目录改名为 $LEGACY"
  mv "$DEPLOY_PATH" "$LEGACY"
  # 首次从实体目录迁出时，LEGACY 即上一 artifact
  PREV_RELEASE="$LEGACY"
  ln -sfn "$RELEASE_PATH" "$DEPLOY_PATH"
else
  ln -sfn "$RELEASE_PATH" "$DEPLOY_PATH"
fi

echo "$NEW_PORT" >"$PORT_FILE"
echo "$CAND_SLOT" >"$APP_SLOT_FILE"
pm2 save || true
# 切流后失败不再只删候选，而是完整回切上一 artifact
trap - EXIT

# --- 7) 发布后 smoke；失败则自动回滚上一 release ---
if ! deploy_smoke "$NEW_PORT"; then
  rollback_to_previous "切流后 smoke 失败"
  die "新版本切流后 smoke 失败，已尝试回滚"
fi
cd "$RELEASE_PATH"
if ! npm run equity:assert-seeded; then
  rollback_to_previous "equity:assert-seeded 失败"
  die "equity:assert-seeded 失败，已尝试回滚"
fi

# --- 8) 只保留最近 N 个 web release（永不删当前与刚回滚所需的上一份）---
log "清理旧 web release（保留 $KEEP_RELEASES 个）"
# shellcheck disable=SC2012
ls -1dt "$RELEASE_ROOT"/release-* 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  case "$old" in
    "$RELEASE_PATH") continue ;;
  esac
  if [ "$(readlink -f "$DEPLOY_PATH" 2>/dev/null || true)" = "$(readlink -f "$old" 2>/dev/null || true)" ]; then
    continue
  fi
  log "rm -rf $old"
  rm -rf "$old"
done

log "完成：active_port=$NEW_PORT app=$CAND_APP release=$RELEASE_PATH"
