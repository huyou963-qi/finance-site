#!/bin/bash
# 等当前 Form 4 全量回填结束后，用修复后的代码做一次全历史重跑。
#
# 为什么必须重跑：回填进程加载的是修复前的代码，它会
#   1) 把「发行人是别家」误计为 failed，令 coverage.complete 恒为 false；
#   2) 因 XSD 时区后缀日期整份拒收（GS 418 份、DG 16 份）。
# 每天 03:20 的增量任务只走 --since=2025-01-01，捞不回历史申报，故需全历史跑一次。
# 已入库的申报有缓存会快速跳过（GS 1858 份含 738 份重抓仅约 10 分钟）。
#
# 与 03:20 的定时任务共用同一把锁，避免并发打 SEC。
set -uo pipefail
cd /opt/finance-site
LOG=logs/post-backfill-resync.log
exec >> $LOG 2>&1
echo "[$(date '+%F %T')] 守候回填结束…"
while true; do
  # 回填进程还在 → 继续等
  if pgrep -f 'sync-form4.*--symbols=' > /dev/null; then sleep 300; continue; fi
  # 进程已退出，确认确实跑到了 627
  DONE=$(grep -cE '^[A-Z][A-Z.-]* \{' logs/form4-full-rerun.log 2>/dev/null || echo 0)
  echo "[$(date '+%F %T')] 回填进程已退出，完成 ${DONE}/627"
  if [ "$DONE" -lt 600 ]; then
    echo "[$(date '+%F %T')] 完成数不足 600，判为异常中断，不自动重跑，交人工处理"
    exit 1
  fi
  break
done
echo "[$(date '+%F %T')] 开始全历史重跑（--tracked-only --since=2006-01-01）"
flock /tmp/finance-ownership-sync.lock   nice -n 10 env NODE_OPTIONS=--max-old-space-size=1024   npm run quant:sync-form4 -- --tracked-only --since=2006-01-01
echo "[$(date '+%F %T')] 重跑结束，退出码 $?"
