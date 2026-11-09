#!/usr/bin/env bash
# CI 传包：rsync 断点续传 + 重试，再在远端校验大小和 gzip 完整性。
#   bash scripts/ci/deploy-upload.sh <local-file> <user@host> <remote-path>
# 环境：DEPLOY_PORT（默认 22）、DEPLOY_RSYNC_TIMEOUT_SEC（单次 rsync 上限，默认 2400）
set -euo pipefail

LOCAL="$1"
TARGET="$2"
REMOTE="$3"
PORT="${DEPLOY_PORT:-22}"
TIMEOUT_SEC="${DEPLOY_RSYNC_TIMEOUT_SEC:-2400}"
SSH_OPTS=(-p "${PORT}" -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ConnectTimeout=30)
RSYNC_RSH="ssh -p ${PORT} -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ConnectTimeout=30"

LOCAL_SIZE=$(stat -c%s "${LOCAL}")
echo "upload ${LOCAL} bytes=${LOCAL_SIZE} ($((LOCAL_SIZE / 1024 / 1024)) MB) -> ${REMOTE}"

# rsync --partial --inplace：中断后可续传，避免每次重传整包。
rsync_once() {
  # timeout 防止单次卡死拖到 job 上限才暴露
  timeout --signal=TERM --kill-after=30 "${TIMEOUT_SEC}" \
    rsync -av --partial --inplace --timeout=120 \
      -e "${RSYNC_RSH}" \
      "${LOCAL}" "${TARGET}:${REMOTE}"
}

START_TS=$(date +%s)
ATTEMPT=1
MAX_ATTEMPTS=3
until rsync_once; do
  RC=$?
  if [ "${ATTEMPT}" -ge "${MAX_ATTEMPTS}" ]; then
    ELAPSED=$(( $(date +%s) - START_TS ))
    echo "::error::传包失败：${LOCAL} rsync 连续 ${MAX_ATTEMPTS} 次未成功（最后 exit=${RC}，已耗时 ${ELAPSED}s）。常见原因是 GitHub runner→香港跨境链路抖动；可重跑本 workflow，或检查香港机磁盘/SSH。"
    exit 1
  fi
  echo "::warning::rsync 第 ${ATTEMPT}/${MAX_ATTEMPTS} 次失败（exit=${RC}）；10s 后断点续传重试"
  ATTEMPT=$((ATTEMPT + 1))
  sleep 10
done
ELAPSED=$(( $(date +%s) - START_TS ))
echo "rsync_ok file=${LOCAL} attempts=${ATTEMPT} elapsed_sec=${ELAPSED}"

# 远端完整性：大小一致 + gzip 可读，再进入零停机切流
ssh "${SSH_OPTS[@]}" "${TARGET}" \
  "REMOTE_SIZE=\$(stat -c%s '${REMOTE}'); \
   echo remote_bytes=\$REMOTE_SIZE expected=${LOCAL_SIZE}; \
   [ \"\$REMOTE_SIZE\" -eq ${LOCAL_SIZE} ] || { echo 'size mismatch'; exit 1; }; \
   gzip -t '${REMOTE}' || { echo 'gzip -t failed (corrupt tarball)'; exit 1; }" \
  || {
    echo "::error::传包后校验失败：${REMOTE} 大小不一致或 gzip 损坏。请重跑 Deploy；勿在校验失败时继续切流。"
    exit 1
  }
