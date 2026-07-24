#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 云端：安全导入本地算好的 factor_snapshot dump（整表替换：备份→删索引→truncate→restore→重建）。
# 配合 refresh-and-pack.sh 使用。factor_snapshot 是纯计算派生表，整表替换安全。
#
# 用法（云端 /opt/finance-site）：
#   bash scripts/quant/cloud-import-factors.sh /opt/finance-site/factor_snapshot_YYYYMMDD.dump
#
# 可选环境变量：
#   PGBIN   pg 工具目录（默认 /usr/lib/postgresql/17/bin）
#   ENVFILE dotenv 文件（默认 .env.local）
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "用法: bash scripts/quant/cloud-import-factors.sh <factor_snapshot dump 文件路径>"; exit 1
fi

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
ENVFILE="${ENVFILE:-.env.local}"
DBURL=$(grep '^DATABASE_URL=' "$ENVFILE" | cut -d= -f2- | tr -d '"' | sed 's/?.*//')
BK="backup_factor_snapshot_$(date +%Y%m%d_%H%M%S).dump"

echo "== 备份当前云端 factor_snapshot → $BK =="
"$PGBIN/pg_dump" "$DBURL" -t mds.factor_snapshot --data-only --no-owner -Fc -f "$BK"

echo "== 删 2 个非主键索引 + 清空 =="
"$PGBIN/psql" "$DBURL" -c "DROP INDEX IF EXISTS mds.factor_snapshot_date_factor_key_idx; DROP INDEX IF EXISTS mds.factor_snapshot_symbol_date_factor_key_key; TRUNCATE mds.factor_snapshot;"

echo "== 导入 $DUMP =="
"$PGBIN/pg_restore" --data-only --no-owner -t factor_snapshot -d "$DBURL" "$DUMP"

echo "== 重建索引 =="
"$PGBIN/psql" "$DBURL" -c "CREATE INDEX factor_snapshot_date_factor_key_idx ON mds.factor_snapshot USING btree (date, factor_key); CREATE UNIQUE INDEX factor_snapshot_symbol_date_factor_key_key ON mds.factor_snapshot USING btree (symbol, date, factor_key);"

echo "== 验证 =="
"$PGBIN/psql" "$DBURL" -tAc "SELECT 'rows='||count(*)||' dates='||count(distinct date)||' funding='||count(*) FILTER (WHERE factor_key LIKE 'inst%') FROM mds.factor_snapshot"
echo "✅ DONE（备份在 $BK，确认无误后可删）"
