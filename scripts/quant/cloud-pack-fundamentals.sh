#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 云端：跑深历史基本面回填 → 导出 equity_fundamental_snapshot 供本地导入。
#
# 方向说明（与 refresh-and-pack.sh 相反）：
#   SEC 链路云端快、本地慢 → 原始基本面在**云端**拉；
#   build-factors 内存密集、云端跑不动 → 因子在**本地**算（见 refresh-and-pack.sh）。
#   本脚本负责前半段：云端拉数 + 打包回传。
#
# 用法（云端 /opt/finance-site）：
#   bash scripts/quant/cloud-pack-fundamentals.sh                    # 全量回填 2010 起（70 季）
#   QUARTERS=70 bash scripts/quant/cloud-pack-fundamentals.sh
#   SKIP_SYNC=1 bash scripts/quant/cloud-pack-fundamentals.sh        # 只打包，不重新拉 SEC
#
# 可选环境变量：
#   PGBIN     pg 工具目录（默认 /usr/lib/postgresql/17/bin）
#   ENVFILE   dotenv 文件（默认 .env.local）
#   QUARTERS  回填季数（默认 70 ≈ 2009 起）
#   SKIP_SYNC 非空则跳过 SEC 拉取，直接打包
#
# 幂等/续跑：sync 走 --resume-log，成功的 symbol 记在 .data/quant/backfill-cloud.log，
# 中断后重跑同一命令自动跳过已完成的；失败的不记日志，会被重试。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
ENVFILE="${ENVFILE:-.env.local}"
QUARTERS="${QUARTERS:-70}"
LIST=".data/quant/backfill-universe-2010.txt"
RESUME=".data/quant/backfill-cloud.log"
OUT="equity_fundamental_snapshot_$(date +%Y%m%d).dump"

if [ ! -f "$ENVFILE" ]; then
  echo "找不到 $ENVFILE（在仓库根目录运行，或用 ENVFILE=路径 指定）"; exit 1
fi

if [ -z "${SKIP_SYNC:-}" ]; then
  echo "== [1/3] 生成回填名单（历史成分并集 ∩ equity_security）=="
  npm run equity:build-backfill-universe -- --from=2010-01-01 --out="$LIST"

  echo "== [2/3] 拉 SEC companyfacts 深历史（--quarters=$QUARTERS，可断点续跑）=="
  # SEC_FETCH_TIMEOUT_MS：companyfacts 单文件 4–20MB，默认 10s 在慢链路会超时
  SEC_FETCH_TIMEOUT_MS="${SEC_FETCH_TIMEOUT_MS:-90000}" \
    npm run equity:sync-fundamentals -- \
      --period-type=Q --quarters="$QUARTERS" \
      --symbols-file="$LIST" --resume-log="$RESUME" --delay-ms=150
else
  echo "== [1-2/3] SKIP_SYNC=1，跳过 SEC 拉取 =="
fi

echo "== [3/3] 导出 mds.equity_fundamental_snapshot → $OUT =="
DBURL=$(grep '^DATABASE_URL=' "$ENVFILE" | cut -d= -f2- | tr -d '"' | sed 's/?.*//')
"$PGBIN/pg_dump" "$DBURL" -t mds.equity_fundamental_snapshot --data-only --no-owner -Fc -f "$OUT"
ls -lh "$OUT"
"$PGBIN/psql" "$DBURL" -tAc "
  SELECT 'rows='||count(*)||' symbols='||count(distinct symbol)||
         ' Q='||count(*) FILTER (WHERE period_type='Q')||
         ' minFiscal='||coalesce(min(fiscal_date)::text,'-')
  FROM mds.equity_fundamental_snapshot"

cat <<EOF

✅ 完成。下一步（本地）：
  1) 把 $OUT 拉回本地仓库根目录
  2) 本地执行： bash scripts/quant/local-import-fundamentals.sh $OUT
  3) 本地重算因子： npm run quant:build-factors -- --full --from=2010-01
  4) 本地打包因子回传云端： bash scripts/quant/refresh-and-pack.sh（或直接 pg_dump factor_snapshot）
EOF
