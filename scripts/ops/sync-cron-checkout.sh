#!/bin/sh
# 把部署产物里的源码同步到 cron 检出。
#
# 为什么需要这一步：deploy.yml 的 DEPLOY_PATH 只有 /opt/finance-site，而
# **cron 的数据 worker 与日历同步跑在 /opt/finance-site-jp-data**（见 crontab：
# `*/5 * * * * cd /opt/finance-site-jp-data && npm run data:worker`）。那个检出
# 靠手工 rsync 更新，一旦忘了，线上调度器就继续跑旧代码，而且部署是绿的、
# 没有任何提示——2026-09 的调度器修复就因此需要每次手工补同步。
#
# 只同步源码。以下一律不碰：
#   node_modules / .env.local  —— 它们是指向 /opt/finance-site 的符号链接
#   .data                      —— 14M 运行态源缓存（boj / e-stat / jgb…），不在部署包里
#   .next / public             —— cron 检出不跑 web
#
# 用 rsync --delete 而不是 tar 叠加：删掉的文件必须真的消失，否则被移走的模块
# （如 ismOfficial/civilTime.ts → scheduler/civilTime.ts）会留下重复旧副本。
#
# 用法（部署里自动调用，也可手工跑）：
#   sh scripts/ops/sync-cron-checkout.sh [源检出] [cron 检出]
set -eu

SRC_PATH="${1:-/opt/finance-site}"
JP_PATH="${2:-/opt/finance-site-jp-data}"
WORKER_LOCK=/tmp/finance-data-worker.lock
CALENDAR_LOCK=/tmp/finance-sync-calendar.lock

# 同步的源码目录（rsync --delete）与散装文件（直接覆盖）
SYNC_DIRS="src scripts prisma data"
SYNC_FILES="package.json package-lock.json tsconfig.json next.config.ts"

log() { echo "[sync-cron-checkout] $*"; }

if [ ! -d "$JP_PATH" ]; then
  log "跳过：$JP_PATH 不存在（该主机没有独立 cron 检出）"
  exit 0
fi
if [ "$SRC_PATH" = "$JP_PATH" ]; then
  log "跳过：源与目标是同一目录"
  exit 0
fi
if [ ! -d "$SRC_PATH/src" ]; then
  log "源检出 $SRC_PATH 里没有 src/，拒绝同步" >&2
  exit 1
fi

do_sync() {
  for d in $SYNC_DIRS; do
    if [ -d "$SRC_PATH/$d" ]; then
      rsync -a --delete "$SRC_PATH/$d/" "$JP_PATH/$d/"
    fi
  done
  for f in $SYNC_FILES; do
    if [ -f "$SRC_PATH/$f" ]; then
      cp -a "$SRC_PATH/$f" "$JP_PATH/$f"
    fi
  done
}

# cron 的 worker / 日历同步正在读这些源码，换文件前先拿它们的锁，避免 tsx
# 读盘中途被抽走文件。两个任务用各自的锁，所以要同时持有。
# 递归调用时用环境变量标记「锁已持有」：只干活，校验留给外层做一次。
if [ "${SYNC_CRON_CHECKOUT_LOCKED:-}" = "1" ]; then
  do_sync
  exit 0
fi

if ! command -v flock >/dev/null 2>&1; then
  do_sync
# 拿不到锁也不能放弃同步：检出落后（调度器跑旧代码且无任何提示）比一次并发换
# 文件严重得多——后者最坏是当轮 cron 报错，下一轮 5 分钟后自愈。
elif ! SYNC_CRON_CHECKOUT_LOCKED=1 \
       flock -w 300 "$WORKER_LOCK" \
         flock -w 300 "$CALENDAR_LOCK" \
           sh "$0" "$SRC_PATH" "$JP_PATH"; then
  log "带锁同步未成功（超时或出错），不带锁重试一次"
  do_sync
fi

# 同步完必须一致，否则「部署绿了但调度器还在跑旧代码」的老问题会换个形式复现。
mismatch=0
for d in src scripts; do
  a=$(cd "$SRC_PATH" && find "$d" -type f -exec md5sum {} + | sort -k2 | md5sum | cut -d' ' -f1)
  b=$(cd "$JP_PATH" && find "$d" -type f -exec md5sum {} + | sort -k2 | md5sum | cut -d' ' -f1)
  if [ "$a" != "$b" ]; then
    log "校验失败：$d/ 两个检出不一致（$a vs $b）" >&2
    mismatch=1
  fi
done
if [ "$mismatch" != "0" ]; then
  exit 1
fi

log "已同步并校验一致：$SRC_PATH → $JP_PATH（$SYNC_DIRS）"
