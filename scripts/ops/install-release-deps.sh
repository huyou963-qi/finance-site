#!/bin/sh
# 共享依赖：按 package-lock.json 哈希（deploy-pack.mjs 的 deps key）在
# $SHARED/deps/<key>/node_modules 保留一份解压好的依赖，各 web release 用硬链接
# 取用。代码改动的部署无需再上传 node_modules。
#
#   install-release-deps.sh ensure <key>            确保共享依赖可用（必要时从依赖包安装）
#   install-release-deps.sh link <release> <key>    把共享依赖硬链接进 release/node_modules
#   install-release-deps.sh prune                   删除已无 release 引用的共享依赖
#
# 退出码：0 成功；3 共享依赖缺失且没有可用依赖包（调用方应上传依赖包后重试，
# 此时尚未改动任何东西）；其它非 0 为错误。
#
# 不变量：release 里的 node_modules 与共享目录共用 inode，**任何人不得原地修改**
# （不要在 release 里 npm install / prisma generate）。删除共享目录不影响已有 release，
# 硬链接各自保有数据，所以回滚永远不依赖 $SHARED/deps。
set -eu

SHARED="${SHARED_PATH:-/opt/finance-site-shared}"
RELEASE_ROOT="${RELEASE_ROOT:-/opt/finance-site-releases}"
DEPS_ROOT="${DEPS_ROOT:-$SHARED/deps}"
DEPS_TARBALL="${DEPS_TARBALL:-$SHARED/deploy-deps.tar.gz}"
KEY_FILE=.deploy-deps-key
# 依赖包完整性的最小判据：网站、迁移和 cron 数据脚本都要用到。
REQUIRED_FILES="node_modules/next/dist/bin/next node_modules/next/package.json node_modules/@prisma/client/package.json node_modules/prisma/package.json node_modules/tsx/package.json node_modules/dotenv-cli/package.json"

log() { echo "[release-deps] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

valid_key() {
  case "$1" in
    ""|*[!0-9a-f]*) return 1 ;;
  esac
  return 0
}

# 目录 $1 是否是 key=$2 的完整依赖
# （POSIX sh 没有 local：本函数只用 _dc_ 前缀变量，避免覆盖调用方的 dir/key）
deps_complete() {
  _dc_dir="$1"; _dc_key="$2"
  [ -f "$_dc_dir/.complete" ] || return 1
  [ "$(cat "$_dc_dir/.complete")" = "$_dc_key" ] || return 1
  for _dc_f in $REQUIRED_FILES; do
    [ -f "$_dc_dir/$_dc_f" ] || return 1
  done
  return 0
}

ensure() {
  key="$1"
  valid_key "$key" || die "非法 deps key: '$key'"
  dir="$DEPS_ROOT/$key"
  mkdir -p "$DEPS_ROOT"

  if [ -f "$DEPS_TARBALL" ]; then
    tar_key=$(tar -xzf "$DEPS_TARBALL" -O "$KEY_FILE" 2>/dev/null | tr -d '[:space:]' || true)
    if [ "$tar_key" != "$key" ]; then
      log "忽略不匹配的依赖包（包内 key=${tar_key:-none}，需要 $key）"
      rm -f "$DEPS_TARBALL"
    fi
  fi

  if [ -f "$DEPS_TARBALL" ]; then
    # 有依赖包就以它为准（CI 判断服务器缺失或强制重传），装到临时目录后原子换入。
    gzip -t "$DEPS_TARBALL" || die "依赖包损坏: $DEPS_TARBALL"
    tmp=$(mktemp -d "$DEPS_ROOT/.incoming-$key.XXXXXX")
    log "解压依赖包到 $tmp"
    tar -xzf "$DEPS_TARBALL" -C "$tmp"
    printf '%s\n' "$key" >"$tmp/.complete"
    deps_complete "$tmp" "$key" || { rm -rf "$tmp"; die "依赖包内容不完整"; }
    if [ -e "$dir" ]; then
      stale="$DEPS_ROOT/.stale-$key.$$"
      mv "$dir" "$stale"
      mv "$tmp" "$dir"
      rm -rf "$stale"
    else
      mv "$tmp" "$dir"
    fi
    rm -f "$DEPS_TARBALL"
    log "共享依赖已安装: $dir"
    return 0
  fi

  if deps_complete "$dir" "$key"; then
    log "复用共享依赖: $dir"
    return 0
  fi
  log "共享依赖缺失或不完整（$dir），且没有依赖包 $DEPS_TARBALL"
  exit 3
}

link() {
  release="$1"; key="$2"
  dir="$DEPS_ROOT/$key"
  deps_complete "$dir" "$key" || die "共享依赖不可用: $dir（先运行 ensure）"
  [ -d "$release" ] || die "release 不存在: $release"
  mkdir -p "$release/node_modules"
  # 同一文件系统用硬链接（不占额外空间、秒级）；跨文件系统退回完整复制。
  if ln "$dir/.complete" "$release/.deps-linktest" 2>/dev/null; then
    rm -f "$release/.deps-linktest"
    log "硬链接 $dir/node_modules -> $release/node_modules"
    cp -al "$dir/node_modules/." "$release/node_modules/"
  else
    log "警告: 无法硬链接（跨文件系统？），完整复制依赖"
    cp -a "$dir/node_modules/." "$release/node_modules/"
  fi
  [ -f "$release/node_modules/.prisma/client/index.js" ] \
    || die "release 缺少 node_modules/.prisma/client（应来自应用包）"
  for f in $REQUIRED_FILES; do
    [ -f "$release/$f" ] || die "release 依赖缺失: $f"
  done
}

prune() {
  [ -d "$DEPS_ROOT" ] || return 0
  # 中断留下的临时目录（超过 1 天）
  find "$DEPS_ROOT" -mindepth 1 -maxdepth 1 -type d \( -name '.incoming-*' -o -name '.stale-*' \) \
    -mtime +0 -exec rm -rf {} + 2>/dev/null || true
  keep=" "
  for marker in "$RELEASE_ROOT"/release-*/"$KEY_FILE"; do
    [ -f "$marker" ] || continue
    keep="$keep$(tr -d '[:space:]' <"$marker") "
  done
  for dir in "$DEPS_ROOT"/*; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    valid_key "$name" || continue
    case "$keep" in
      *" $name "*) continue ;;
    esac
    log "删除无引用的共享依赖: $dir"
    rm -rf "$dir"
  done
}

cmd="${1:-}"
case "$cmd" in
  ensure) [ $# -eq 2 ] || die "用法: $0 ensure <key>"; ensure "$2" ;;
  link) [ $# -eq 3 ] || die "用法: $0 link <release> <key>"; link "$2" "$3" ;;
  prune) prune ;;
  *) die "用法: $0 ensure <key> | link <release> <key> | prune" ;;
esac
