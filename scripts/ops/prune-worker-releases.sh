#!/bin/sh
# 清理调度器不可变 release 目录与站点旁路离线归档，释放磁盘。
# 安全约束：
# - 永不删除当前 /opt/finance-site-jp-data 指向的 active release
# - 永不删除共享运行态缓存 runtime-data（若仍挂在 legacy/.data 下会先迁出）
# - 默认 --dry-run；必须显式 --apply 才删除
# - 持有 worker + calendar flock，避免与部署/worker 竞态
#
# 用法：
#   sh scripts/ops/prune-worker-releases.sh --dry-run
#   sh scripts/ops/prune-worker-releases.sh --apply --keep 5
#   KEEP=5 JP_PATH=/opt/finance-site-jp-data sh scripts/ops/prune-worker-releases.sh --apply
set -eu

JP_PATH="${JP_PATH:-/opt/finance-site-jp-data}"
SITE_PATH="${SITE_PATH:-/opt/finance-site}"
WORKER_LOCK=/tmp/finance-data-worker.lock
CALENDAR_LOCK=/tmp/finance-sync-calendar.lock
KEEP="${KEEP:-5}"
APPLY=0
PRUNE_SITE_ARCHIVES=1

log() { echo "[prune-worker-releases] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    --keep)
      shift
      [ "$#" -gt 0 ] || die "--keep 需要数字"
      KEEP="$1"
      ;;
    --keep=*) KEEP="${1#--keep=}" ;;
    --skip-site-archives) PRUNE_SITE_ARCHIVES=0 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *) die "未知参数: $1" ;;
  esac
  shift
done

case "$KEEP" in
  ''|*[!0-9]*) die "--keep 必须是正整数" ;;
esac
[ "$KEEP" -ge 1 ] || die "--keep 至少为 1（保留 active）"

command -v flock >/dev/null 2>&1 || die "需要 flock"
[ -e "$JP_PATH" ] || die "找不到 JP_PATH=$JP_PATH"

if [ "${PRUNE_WORKER_RELEASES_LOCKED:-}" != "1" ]; then
  exec env PRUNE_WORKER_RELEASES_LOCKED=1 flock -w 1800 "$WORKER_LOCK" \
    flock -w 1800 "$CALENDAR_LOCK" sh "$0" \
    $([ "$APPLY" -eq 1 ] && echo --apply || echo --dry-run) \
    --keep "$KEEP" \
    $([ "$PRUNE_SITE_ARCHIVES" -eq 0 ] && echo --skip-site-archives || true)
fi

RELEASE_ROOT="${JP_PATH}-releases"
[ -d "$RELEASE_ROOT" ] || die "找不到 release 根目录: $RELEASE_ROOT"

ACTIVE_PATH=$(readlink -f "$JP_PATH")
case "$ACTIVE_PATH" in
  "$RELEASE_ROOT"/release-*) ;;
  *) die "active 路径不在 release 根下，拒绝继续: $ACTIVE_PATH" ;;
esac
ACTIVE_NAME=$(basename "$ACTIVE_PATH")
RUNTIME_DATA="$RELEASE_ROOT/runtime-data"

log "mode=$([ "$APPLY" -eq 1 ] && echo APPLY || echo DRY-RUN) keep=$KEEP active=$ACTIVE_NAME"
df -h "$(dirname "$RELEASE_ROOT")" | tail -n 1 | awk '{print "[prune-worker-releases] disk before: "$0}'

# --- 1) 把仍挂在 legacy/旧 release 内的 .data 迁到稳定 runtime-data ---
CURRENT_DATA=""
DATA_MIGRATE_FROM=""
if [ -e "$JP_PATH/.data" ]; then
  CURRENT_DATA=$(readlink -f "$JP_PATH/.data")
fi

migrate_runtime_data() {
  [ -n "$CURRENT_DATA" ] || return 0
  [ -d "$CURRENT_DATA" ] || die ".data 目标不是目录: $CURRENT_DATA"
  if [ "$CURRENT_DATA" = "$RUNTIME_DATA" ]; then
    log "runtime-data 已就位: $RUNTIME_DATA"
    return 0
  fi
  case "$CURRENT_DATA" in
    "$RELEASE_ROOT"/legacy-*/.data|"$RELEASE_ROOT"/release-*/.data) ;;
    *)
      log "保留外部 .data（不迁移）: $CURRENT_DATA"
      return 0
      ;;
  esac
  if [ -e "$RUNTIME_DATA" ]; then
    die "目标 runtime-data 已存在且与当前 .data 不同，请人工核对: $RUNTIME_DATA vs $CURRENT_DATA"
  fi
  DATA_MIGRATE_FROM="$CURRENT_DATA"
  log "迁移运行态缓存: $CURRENT_DATA -> $RUNTIME_DATA"
  if [ "$APPLY" -eq 1 ]; then
    mv "$CURRENT_DATA" "$RUNTIME_DATA"
    CURRENT_DATA="$RUNTIME_DATA"
  fi
}

# --- 2) 先按 mtime 选定保留/删除（必须在任何 ln/mv 之前，避免改 .data 打乱目录时间）---
KEEP_LIST=$(mktemp)
DELETE_LIST=$(mktemp)
CAND=$(mktemp)
trap 'rm -f "$KEEP_LIST" "$DELETE_LIST" "$CAND"' EXIT

# %T@ = 目录 mtime 秒；在改写 symlink 之前快照排序
find "$RELEASE_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'release-*' -printf '%T@\t%f\n' 2>/dev/null \
  | sort -nr \
  | cut -f2 >"$CAND" || true

: >"$KEEP_LIST"
: >"$DELETE_LIST"
if ! grep -qx "$ACTIVE_NAME" "$CAND"; then
  die "active release 不在 release-* 列表中: $ACTIVE_NAME"
fi
# 名额：1 给 active，其余 KEEP-1 给按 mtime 最新的非 active
echo "$ACTIVE_NAME" >>"$KEEP_LIST"
extra_slots=$((KEEP - 1))
[ "$extra_slots" -lt 0 ] && extra_slots=0
while IFS= read -r name; do
  [ -n "$name" ] || continue
  if [ "$name" = "$ACTIVE_NAME" ]; then
    continue
  fi
  if [ "$extra_slots" -gt 0 ]; then
    echo "$name" >>"$KEEP_LIST"
    extra_slots=$((extra_slots - 1))
  else
    echo "$name" >>"$DELETE_LIST"
  fi
done <"$CAND"

log "保留 releases:"
if [ -s "$KEEP_LIST" ]; then sed 's/^/  keep /' "$KEEP_LIST"; else log "  (无)"; fi
log "将删除 releases:"
if [ -s "$DELETE_LIST" ]; then sed 's/^/  delete /' "$DELETE_LIST"; else log "  (无)"; fi

# legacy 删除计划也在 mutate 前登记
for legacy in "$RELEASE_ROOT"/legacy-*; do
  [ -d "$legacy" ] || continue
  if [ -d "$legacy/.data" ]; then
    case "$CURRENT_DATA" in
      "$legacy/.data")
        DATA_MIGRATE_FROM="$CURRENT_DATA"
        log "将删除 legacy（先迁走 .data）: $(basename "$legacy")"
        echo "legacy:$(basename "$legacy")" >>"$DELETE_LIST"
        ;;
      *)
        log "跳过仍含 .data 的 legacy: $legacy"
        ;;
    esac
    continue
  fi
  case "${CURRENT_DATA:-}" in
    "$legacy"/*) log "跳过仍承载运行态的 legacy: $legacy"; continue ;;
  esac
  echo "legacy:$(basename "$legacy")" >>"$DELETE_LIST"
  log "将删除 legacy: $(basename "$legacy")"
done

# --- 3) 迁移 .data 并只重指向「保留集」的 symlink（避免无谓触碰待删目录）---
migrate_runtime_data

retarget_one() {
  link="$1"
  TARGET="$RUNTIME_DATA"
  [ -L "$link" ] || return 0
  dest=$(readlink "$link")
  resolved=$(readlink -f "$link" 2>/dev/null || true)
  if [ "$resolved" = "$TARGET" ] || [ "$dest" = "$TARGET" ]; then
    return 0
  fi
  log "重指向 .data: $link -> $TARGET (was $dest)"
  if [ "$APPLY" -eq 1 ]; then
    ln -sfn "$TARGET" "$link"
  fi
}

if [ -d "$RUNTIME_DATA" ] || [ "$APPLY" -eq 0 ]; then
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    retarget_one "$RELEASE_ROOT/$name/.data"
  done <"$KEEP_LIST"
  retarget_one "$JP_PATH/.data"
fi

delete_path() {
  path="$1"
  if [ "$path" = "$ACTIVE_PATH" ]; then
    die "拒绝删除 active: $path"
  fi
  case "$path" in
    "$RUNTIME_DATA"|"$RUNTIME_DATA"/*) die "拒绝删除 runtime-data: $path" ;;
  esac
  # 二次确认：路径真实位置不得等于 active
  real=$(readlink -f "$path" 2>/dev/null || true)
  if [ -n "$real" ] && [ "$real" = "$ACTIVE_PATH" ]; then
    die "拒绝删除 active 真实路径: $path"
  fi
  # apply 时 migrate 已先完成；dry-run 允许「将迁走 .data 后再删」的 legacy 出现在计划中。
  if [ "$APPLY" -eq 1 ] && [ -e "$JP_PATH/.data" ]; then
    data_real=$(readlink -f "$JP_PATH/.data" 2>/dev/null || true)
    case "$data_real" in
      "$real"|"$real"/*) die "拒绝删除仍被 .data 引用的路径: $path" ;;
    esac
  fi
  log "rm -rf $path"
  if [ "$APPLY" -eq 1 ]; then
    rm -rf "$path"
  fi
}

while IFS= read -r name; do
  [ -n "$name" ] || continue
  case "$name" in
    legacy:*) delete_path "$RELEASE_ROOT/${name#legacy:}" ;;
    *) delete_path "$RELEASE_ROOT/$name" ;;
  esac
done <"$DELETE_LIST"

# --- 3) 站点旁路离线归档（不影响 DB / 运行中的 .next）---
if [ "$PRUNE_SITE_ARCHIVES" -eq 1 ] && [ -d "$SITE_PATH" ]; then
  for f in \
    "$SITE_PATH/factor_snapshot_20260726.dump" \
    "$SITE_PATH/factor_snapshot_20260910.dump" \
    "$SITE_PATH/backup_factor_snapshot_20260910_114609.dump" \
    "$SITE_PATH/next-build.tar.gz"
  do
    if [ -f "$f" ]; then
      log "删除离线归档: $f ($(du -h "$f" | awk '{print $1}'))"
      if [ "$APPLY" -eq 1 ]; then
        rm -f "$f"
      fi
    fi
  done
  # 压缩已轮转但 delaycompress 留下的超大 .1（保留内容，只压缩）
  for f in "$SITE_PATH/logs/data-worker.log.1" "$SITE_PATH/logs/sync-calendar.log.1"; do
    if [ -f "$f" ] && [ ! -f "$f.gz" ]; then
      log "gzip 轮转日志: $f ($(du -h "$f" | awk '{print $1}'))"
      if [ "$APPLY" -eq 1 ]; then
        gzip -f "$f"
      fi
    fi
  done
fi

# --- 4) 复核 ---
ACTIVE_AFTER=$(readlink -f "$JP_PATH")
[ "$ACTIVE_AFTER" = "$ACTIVE_PATH" ] || [ "$APPLY" -eq 0 ] || die "active 在清理后发生变化: $ACTIVE_AFTER"
if [ "$APPLY" -eq 1 ]; then
  [ -d "$ACTIVE_AFTER/node_modules" ] || die "active 缺少 node_modules"
  [ -e "$JP_PATH/.env.local" ] || die "active 缺少 .env.local"
  DATA_AFTER=$(readlink -f "$JP_PATH/.data")
  [ -d "$DATA_AFTER" ] || die "active .data 丢失: $DATA_AFTER"
  case "$DATA_AFTER" in
    "$RUNTIME_DATA") log "复核 .data OK -> $DATA_AFTER" ;;
    *) log "复核 .data -> $DATA_AFTER（非默认 runtime-data，已保留）" ;;
  esac
  remaining=$(ls -1d "$RELEASE_ROOT"/release-* 2>/dev/null | wc -l | tr -d ' ')
  log "剩余 release 目录数: $remaining"
fi

df -h "$(dirname "$RELEASE_ROOT")" | tail -n 1 | awk '{print "[prune-worker-releases] disk after: "$0}'
log "完成"
