#!/bin/sh
# 准备独立的调度器版本和依赖，然后在 worker/calendar 锁下切换稳定入口。
# 历史版本保留供回滚；不覆盖运行中的源码，不共享网站 node_modules。
set -eu
SRC_PATH="${1:-/opt/finance-site}"
JP_PATH="${2:-/opt/finance-site-jp-data}"
WORKER_LOCK=/tmp/finance-data-worker.lock
CALENDAR_LOCK=/tmp/finance-sync-calendar.lock
RELEASE_ROOT="${JP_PATH}-releases"
log() { echo "[sync-cron-checkout] $*"; }

[ "$SRC_PATH" != "$JP_PATH" ] || { log "source and target must differ" >&2; exit 1; }
[ -d "$SRC_PATH/src" ] && [ -d "$SRC_PATH/node_modules" ] && [ -f "$SRC_PATH/.env.local" ] || {
  log "source is missing code, dependencies or environment" >&2; exit 1;
}
command -v flock >/dev/null 2>&1 || { log "flock is required" >&2; exit 1; }

# 部署调用方必须在替换网站共享依赖之前拿锁；手动调用也必须等待锁。
# 超时立即失败，绝不降级为无锁覆盖。
if [ "${SYNC_CRON_CHECKOUT_LOCKED:-}" != "1" ]; then
  exec env SYNC_CRON_CHECKOUT_LOCKED=1 flock -w 1800 "$WORKER_LOCK" \
    flock -w 1800 "$CALENDAR_LOCK" sh "$0" "$SRC_PATH" "$JP_PATH"
fi

mkdir -p "$RELEASE_ROOT"
RELEASE_PATH=$(mktemp -d "$RELEASE_ROOT/release-XXXXXXXX")
for d in src scripts prisma data; do
  if [ -d "$SRC_PATH/$d" ]; then mkdir -p "$RELEASE_PATH/$d"; rsync -a "$SRC_PATH/$d/" "$RELEASE_PATH/$d/"; fi
done
for f in package.json package-lock.json tsconfig.json next.config.ts; do
  if [ -f "$SRC_PATH/$f" ]; then cp -a "$SRC_PATH/$f" "$RELEASE_PATH/$f"; fi
done
mkdir -p "$RELEASE_PATH/node_modules"
rsync -a "$SRC_PATH/node_modules/" "$RELEASE_PATH/node_modules/"

# 旧检出包含未提交内容：原样保留，绝不 reset/delete。缓存保留在首次迁移的旧目录。
if [ -d "$JP_PATH" ] && [ ! -L "$JP_PATH" ]; then
  LEGACY_PATH="$RELEASE_ROOT/legacy-$(date +%Y%m%d%H%M%S)-$$"
  mv "$JP_PATH" "$LEGACY_PATH"
  ln -s "$LEGACY_PATH" "$JP_PATH"
  log "preserved legacy checkout: $LEGACY_PATH"
fi
if [ -e "$JP_PATH/.env.local" ]; then
  ENV_PATH=$(readlink -f "$JP_PATH/.env.local")
else
  ENV_PATH=$(readlink -f "$SRC_PATH/.env.local")
fi
if [ -d "$JP_PATH/.data" ]; then
  CACHE_PATH=$(readlink -f "$JP_PATH/.data")
else
  CACHE_PATH="$RELEASE_ROOT/runtime-data"
  mkdir -p "$CACHE_PATH"
fi
ln -s "$ENV_PATH" "$RELEASE_PATH/.env.local"
ln -s "$CACHE_PATH" "$RELEASE_PATH/.data"
(cd "$RELEASE_PATH" && node -e 'const p=require.resolve("tsx"); if (!p.startsWith(process.cwd()+"/")) throw Error("shared tsx dependency"); require("@prisma/client");')
ln -s "$RELEASE_PATH" "$RELEASE_ROOT/current-$$"
mv -Tf "$RELEASE_ROOT/current-$$" "$JP_PATH"
log "activated independent scheduler release: $RELEASE_PATH"
