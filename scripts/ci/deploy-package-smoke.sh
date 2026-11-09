#!/usr/bin/env bash
# CI 部署包自检（在 npm ci + npm run build 之后运行）：
#   1. 打应用包 + 依赖包，报告大小（不含 .next/cache）
#   2. 用真实的 install-release-deps.sh 按服务器布局（临时目录）装依赖、硬链接进两个 release
#   3. 从解压出的 release 直接 `next start`（不带构建缓存），断言能服务页面和静态 chunk
#   4. 断言第二次部署复用共享依赖、release 间共享 inode、prune 只删无引用 key
set -euo pipefail

ROOT=$(pwd)
WORK=$(mktemp -d)
NEXT_PID=""
# 注意：不能 kill 0（会杀掉整个进程组，含 CI step 自身）
cleanup() {
  if [ -n "${NEXT_PID}" ]; then kill "${NEXT_PID}" 2>/dev/null || true; fi
  rm -rf "${WORK}"
}
trap cleanup EXIT

node scripts/deploy-pack.mjs --with-deps
KEY=$(cat deploy-deps-key.txt)

mb() { echo "$(( $(stat -c%s "$1") / 1024 / 1024 ))"; }
echo "::notice::deploy.tar.gz=$(mb deploy.tar.gz)MB deploy-deps.tar.gz=$(mb deploy-deps.tar.gz)MB key=${KEY}"
echo "--- 未压缩体积"
du -sh .next .next/cache .next/server .next/static node_modules 2>/dev/null || true
echo "--- node_modules 最大的 20 个包"
( cd node_modules && du -s ./* ./@*/* 2>/dev/null | sort -rn | head -20 | awk '{printf "%6d MB  %s\n", $1/1024, $2}' )
echo "--- 构建期 devDependencies 体积（不在服务器运行时使用的候选）"
( cd node_modules && du -shc typescript eslint @eslint eslint-config-next @typescript-eslint @playwright playwright playwright-core @tailwindcss tailwindcss @types 2>/dev/null | tail -1 )

if tar -tzf deploy.tar.gz | grep -qE '^\.next/(cache|trace)'; then
  echo "::error::应用包仍含 .next/cache 或 .next/trace"; exit 1
fi
if tar -tzf deploy.tar.gz | grep -E '^node_modules/' | grep -qvE '^node_modules/\.prisma(/|$)'; then
  echo "::error::应用包只应包含 node_modules/.prisma"; exit 1
fi

SHARED="${WORK}/shared"
RELEASES="${WORK}/releases"
mkdir -p "${SHARED}" "${RELEASES}"
export SHARED_PATH="${SHARED}" RELEASE_ROOT="${RELEASES}"
DEPS=scripts/ops/install-release-deps.sh

# 无共享依赖、无依赖包 → 退出码 3（CI 据此补传）
RC=0; sh "${DEPS}" ensure "${KEY}" || RC=$?
[ "${RC}" -eq 3 ] || { echo "::error::期望 exit 3，实际 ${RC}"; exit 1; }

deploy_release() {
  local rel="$1"
  mkdir -p "${rel}"
  tar -xzf deploy.tar.gz -C "${rel}"
  sh "${DEPS}" link "${rel}" "${KEY}"
}

cp deploy-deps.tar.gz "${SHARED}/deploy-deps.tar.gz"
sh "${DEPS}" ensure "${KEY}"
[ ! -e "${SHARED}/deploy-deps.tar.gz" ] || { echo "::error::依赖包装完后应删除"; exit 1; }
deploy_release "${RELEASES}/release-1"

# 第二次「只改代码」的部署：不传依赖包，直接复用
sh "${DEPS}" ensure "${KEY}" | grep -q "复用共享依赖"
deploy_release "${RELEASES}/release-2"
INODE_SHARED=$(stat -c%i "${SHARED}/deps/${KEY}/node_modules/next/package.json")
INODE_R1=$(stat -c%i "${RELEASES}/release-1/node_modules/next/package.json")
INODE_R2=$(stat -c%i "${RELEASES}/release-2/node_modules/next/package.json")
[ "${INODE_SHARED}" = "${INODE_R1}" ] && [ "${INODE_R1}" = "${INODE_R2}" ] \
  || { echo "::error::release 未硬链接共享依赖"; exit 1; }
echo "--- 磁盘：shared deps + 2 个 release（硬链接只计一次）"
du -shc "${SHARED}/deps" "${RELEASES}"/release-* | tail -1

# 从 release 启动（与 pm2 同一入口），不带 .next/cache
REL="${RELEASES}/release-2"
[ ! -e "${REL}/.next/cache" ] || { echo "::error::release 含 .next/cache"; exit 1; }
cd "${REL}"
PORT=3123
DATABASE_URL="postgresql://ci:ci@127.0.0.1:5432/ci" APP_BASE_URL="http://localhost:${PORT}" \
  node node_modules/next/dist/bin/next start -p "${PORT}" >"${WORK}/next.log" 2>&1 &
NEXT_PID=$!
cd "${ROOT}"
CHUNK=$(cd "${REL}/.next/static/chunks" && ls -1 *.js | head -1)
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/_next/static/chunks/${CHUNK}"; then break; fi
  sleep 1
done
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/_next/static/chunks/${CHUNK}" \
  || { cat "${WORK}/next.log"; echo "::error::packaged next start 未能服务静态 chunk"; exit 1; }
# 首页（无数据库时允许 5xx，只要求进程能渲染并应答）
CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 "http://127.0.0.1:${PORT}/" || true)
echo "GET / -> ${CODE}"
[ -n "${CODE}" ] && [ "${CODE}" != "000" ] || { cat "${WORK}/next.log"; echo "::error::首页无应答"; exit 1; }
# @prisma/client 能加载 schema 对应的生成客户端
( cd "${REL}" && node -e 'const {PrismaClient}=require("@prisma/client"); new PrismaClient(); console.log("prisma client ok")' )
kill "${NEXT_PID}"; wait "${NEXT_PID}" 2>/dev/null || true; NEXT_PID=""

# prune：删一个 release 后，无引用的旧 key 被清理，在用 key 保留
mkdir -p "${SHARED}/deps/0000000000000000deadbeef/node_modules"
sh "${DEPS}" prune
[ ! -e "${SHARED}/deps/0000000000000000deadbeef" ] || { echo "::error::prune 未删除无引用 key"; exit 1; }
[ -d "${SHARED}/deps/${KEY}" ] || { echo "::error::prune 删除了在用 key"; exit 1; }
rm -rf "${SHARED}/deps/${KEY}"
# 删掉共享目录后 release 仍完整（硬链接各自持有数据，回滚不依赖 shared/deps）
[ -f "${REL}/node_modules/next/dist/bin/next" ] || { echo "::error::删除共享依赖破坏了 release"; exit 1; }

echo "deploy package smoke ok"
