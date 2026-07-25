#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 云端：导出 institutional_holding（13F 机构持仓）供本地导入。
#
# 方向说明（与 refresh-and-pack.sh 相反，同 cloud-pack-fundamentals.sh）：
#   SEC 13F 数据集云端快、本机 50KB/s 太慢 → 原始持仓在**云端**摄入（sync-13f）；
#   build-factors 内存密集、云端跑不动 → 因子在**本地**算。
#   本脚本负责把云端摄入好的 institutional_holding 打包回传，供本地 build-factors 消费。
#
# 用法（云端 /opt/finance-site；先自行跑完 sync-13f 摄入目标季度）：
#   bash scripts/quant/cloud-pack-holdings.sh                          # 只打包 + 覆盖度报告
#   FROM=2013-06 TO=2019-09 bash scripts/quant/cloud-pack-holdings.sh  # 先 sync-13f 再打包
#
# 可选环境变量：
#   PGBIN    pg 工具目录（默认 /usr/lib/postgresql/17/bin）
#   ENVFILE  dotenv 文件（默认 .env.local）
#   FROM/TO  非空则先跑 sync-13f --from/--to（幂等可续跑），否则跳过直接打包
#
# ⚠ institutional_holding 很大（历史 dump 可达数百 MB，本机磁盘曾满）——注意落盘与清理。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
ENVFILE="${ENVFILE:-.env.local}"
OUT="institutional_holding_$(date +%Y%m%d).dump"

if [ ! -f "$ENVFILE" ]; then
  echo "找不到 $ENVFILE（在仓库根目录运行，或用 ENVFILE=路径 指定）"; exit 1
fi

if [ -n "${FROM:-}" ]; then
  echo "== [1/2] sync-13f --from=${FROM} --to=${TO:-$FROM}（幂等可续跑）=="
  npm run quant:sync-13f -- --from="$FROM" --to="${TO:-$FROM}"
else
  echo "== [1/2] 未设 FROM，跳过 sync-13f，直接打包现有 institutional_holding =="
fi

echo "== [2/2] 导出 mds.institutional_holding → $OUT =="
DBURL=$(grep '^DATABASE_URL=' "$ENVFILE" | cut -d= -f2- | tr -d '"' | sed 's/?.*//')
"$PGBIN/pg_dump" "$DBURL" -t mds.institutional_holding --data-only --no-owner -Fc -f "$OUT"
ls -lh "$OUT"

echo "== 覆盖度报告（WS2 成败判据：filer≥2000 的完整期数应从 25 增至 ~50）=="
"$PGBIN/psql" "$DBURL" -tAc "
  WITH cov AS (
    SELECT period_end, count(DISTINCT filer_cik) n
    FROM mds.institutional_holding GROUP BY period_end)
  SELECT 'rows='||(SELECT count(*) FROM mds.institutional_holding)||
         ' periods='||count(*)||
         ' adequate(filer>=2000)='||count(*) FILTER (WHERE n>=2000)||
         ' minAdequate='||coalesce(min(period_end) FILTER (WHERE n>=2000)::text,'-')
  FROM cov"

cat <<EOF

✅ 完成。下一步（本地仓库根目录）：
  1) 把 $OUT 拉回本地
  2) 本地导入： bash scripts/quant/local-import-holdings.sh $OUT
  3) 本地重算因子： npm run quant:build-factors -- --full --from=2013-05
  4) 本地打包因子回传云端： bash scripts/quant/refresh-and-pack.sh → cloud-import-factors.sh
  5) 代码：factorRegistry 4 个 funding 因子 startYear 2020→2013，提交部署
EOF
