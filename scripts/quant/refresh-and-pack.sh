#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 本地一键：刷新价格/基本面 → 重算近月因子 → dump factor_snapshot 供云端导入。
# 适用于「云端内存不足、因子在本地算好再传」的运维模式（见 docs/QUANT_PHASE5_FUNDING.md）。
#
# 用法（Windows git-bash 或 Linux/WSL，在仓库根目录）：
#   bash scripts/quant/refresh-and-pack.sh                  # 默认重算最近 ~2 个月
#   FROM=2026-05 bash scripts/quant/refresh-and-pack.sh     # 指定重算起点（YYYY-MM）
#
# 可选环境变量：
#   PGBIN   pg_dump 所在目录（默认 Windows 的 PostgreSQL 17 安装路径）
#   ENVFILE dotenv 文件（默认 .env.local）
#
# 产物：仓库根目录 factor_snapshot_YYYYMMDD.dump —— 传到云端用 cloud-import-factors.sh 导入。
#
# 注意：资金面(13F)因子只有在本地 13F 有新季度时才会变新。新季度 13F 的获取见脚本末尾提示。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

PGBIN="${PGBIN:-/c/Program Files/PostgreSQL/17/bin}"
ENVFILE="${ENVFILE:-.env.local}"
FROM="${FROM:-$(date -d '2 months ago' +%Y-%m 2>/dev/null || echo 2020-06)}"
OUT="factor_snapshot_$(date +%Y%m%d).dump"

if [ ! -f "$ENVFILE" ]; then
  echo "找不到 $ENVFILE（在仓库根目录运行，或用 ENVFILE=路径 指定）"; exit 1
fi
if [ ! -x "$PGBIN/pg_dump" ] && [ ! -f "$PGBIN/pg_dump.exe" ]; then
  echo "找不到 pg_dump（$PGBIN）——用 PGBIN=你的 PostgreSQL bin 目录 指定"; exit 1
fi

echo "== [1/4] 刷新本地价格（equity:sync-prices --limit=500）=="
npm run equity:sync-prices -- --limit=500

echo "== [2/4] 刷新本地基本面（equity:sync-fundamentals）=="
npm run equity:sync-fundamentals || echo "(基本面同步失败/无更新，不阻断)"

echo "== [3/4] 重算因子（build-factors --full --from=$FROM）=="
npm run quant:build-factors -- --full --from="$FROM"

echo "== [4/4] 导出 factor_snapshot → $OUT =="
DBURL=$(grep '^DATABASE_URL=' "$ENVFILE" | cut -d= -f2- | tr -d '"' | sed 's/?.*//')
"$PGBIN/pg_dump" "$DBURL" -t mds.factor_snapshot --data-only --no-owner -Fc -f "$OUT"
ls -lh "$OUT"

cat <<EOF

✅ 完成。下一步：
  1) 把 $OUT 传到云端 /opt/finance-site/
  2) 云端执行： bash scripts/quant/cloud-import-factors.sh /opt/finance-site/$OUT

提示：资金面(13F)因子只有本地 13F 有新季度时才更新。新季度约在季末后 45 天披露；
需要时在云端跑 quant:sync-13f 补新季度，再把云端 institutional_holding dump 回本地重算
（云端 SEC 链路快、本地慢），或本地直接 quant:sync-13f 慢速补。
EOF
