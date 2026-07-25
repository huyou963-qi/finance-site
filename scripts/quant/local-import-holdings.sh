#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 本地：导入云端打包的 institutional_holding（整表替换：备份→删索引→truncate→restore→重建→验证）。
# 配合 cloud-pack-holdings.sh 使用。
#
# ⚠️ 与 cloud-import-factors.sh 的关键区别（同 local-import-fundamentals.sh）：
#   factor_snapshot 是**派生表**（重跑 build-factors 即可重算，整表替换风险低）；
#   institutional_holding 是**原始数据表**——只能从 SEC 13F 重摄。本脚本会 TRUNCATE 它。
#   备份文件（backup_*.dump）**确认新数据无误前不要删**。
#
# 用法（本地仓库根目录，Windows git-bash 或 Linux/WSL）：
#   bash scripts/quant/local-import-holdings.sh institutional_holding_YYYYMMDD.dump
#   YES=1 bash scripts/quant/local-import-holdings.sh <dump>   # 跳过交互确认（无人值守）
#
# 可选环境变量：
#   PGBIN   pg 工具目录（默认 Windows 的 PostgreSQL 17 安装路径）
#   ENVFILE dotenv 文件（默认 .env.local）
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "用法: bash scripts/quant/local-import-holdings.sh <institutional_holding dump 文件路径>"; exit 1
fi

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PGBIN="${PGBIN:-/c/Program Files/PostgreSQL/17/bin}"
ENVFILE="${ENVFILE:-.env.local}"
if [ ! -f "$ENVFILE" ]; then
  echo "找不到 $ENVFILE（worktree 里没有就从主检出 copy 一份）"; exit 1
fi
DBURL=$(grep '^DATABASE_URL=' "$ENVFILE" | cut -d= -f2- | tr -d '"' | sed 's/?.*//')
BK="backup_institutional_holding_$(date +%Y%m%d_%H%M%S).dump"

BEFORE=$("$PGBIN/psql" "$DBURL" -tAc "SELECT count(*) FROM mds.institutional_holding")
cat <<EOF
────────────────────────────────────────────────────────────────
⚠️  即将**整表替换原始数据表** mds.institutional_holding
    当前行数 : $BEFORE
    导入文件 : $DUMP
    备份到   : $BK （确认无误前不要删——这张表只能从 SEC 13F 重摄）
────────────────────────────────────────────────────────────────
EOF
if [ -z "${YES:-}" ]; then
  printf "确认继续？输入 yes 回车："
  read -r ans
  [ "$ans" = "yes" ] || { echo "已取消"; exit 1; }
fi

echo "== 备份当前表 → $BK =="
"$PGBIN/pg_dump" "$DBURL" -t mds.institutional_holding --data-only --no-owner -Fc -f "$BK"

echo "== 删非主键索引 + 清空 =="
"$PGBIN/psql" "$DBURL" -c "
  DROP INDEX IF EXISTS mds.institutional_holding_accession_cusip_key;
  DROP INDEX IF EXISTS mds.institutional_holding_cusip_period_end_idx;
  DROP INDEX IF EXISTS mds.institutional_holding_filer_cik_period_end_idx;
  DROP INDEX IF EXISTS mds.institutional_holding_period_end_filed_at_idx;
  DROP INDEX IF EXISTS mds.institutional_holding_symbol_period_end_idx;
  TRUNCATE mds.institutional_holding;"

echo "== 导入 $DUMP =="
"$PGBIN/pg_restore" --data-only --no-owner -t institutional_holding -d "$DBURL" "$DUMP"

echo "== 重建索引 =="
"$PGBIN/psql" "$DBURL" -c "
  CREATE UNIQUE INDEX institutional_holding_accession_cusip_key ON mds.institutional_holding USING btree (accession, cusip);
  CREATE INDEX institutional_holding_cusip_period_end_idx ON mds.institutional_holding USING btree (cusip, period_end);
  CREATE INDEX institutional_holding_filer_cik_period_end_idx ON mds.institutional_holding USING btree (filer_cik, period_end);
  CREATE INDEX institutional_holding_period_end_filed_at_idx ON mds.institutional_holding USING btree (period_end, filed_at);
  CREATE INDEX institutional_holding_symbol_period_end_idx ON mds.institutional_holding USING btree (symbol, period_end);"

echo "== 验证（覆盖度：filer≥2000 的完整期应从 25 增至 ~50，2013Q2 起）=="
AFTER=$("$PGBIN/psql" "$DBURL" -tAc "SELECT count(*) FROM mds.institutional_holding")
"$PGBIN/psql" "$DBURL" -tAc "
  WITH cov AS (
    SELECT period_end, count(DISTINCT filer_cik) n
    FROM mds.institutional_holding GROUP BY period_end)
  SELECT 'rows='||(SELECT count(*) FROM mds.institutional_holding)||
         ' periods='||count(*)||
         ' adequate(filer>=2000)='||count(*) FILTER (WHERE n>=2000)||
         ' minAdequate='||coalesce(min(period_end) FILTER (WHERE n>=2000)::text,'-')
  FROM cov"
echo "行数 $BEFORE → $AFTER"
if [ "$AFTER" -lt "$BEFORE" ]; then
  echo "⚠️  导入后行数变少了——核对来源 dump 是否完整；回滚（先 TRUNCATE 再）："
  echo "    pg_restore --data-only --no-owner -t institutional_holding -d \"\$DBURL\" $BK"
  exit 1
fi
echo "✅ DONE（备份在 $BK，确认无误后可删）"
echo "下一步：npm run quant:build-factors -- --full --from=2013-05"
