#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 本地：导入云端打包的 equity_fundamental_snapshot（整表替换：备份→删索引→truncate→restore→重建→验证）。
# 配合 cloud-pack-fundamentals.sh 使用。
#
# ⚠️ 与 cloud-import-factors.sh 的关键区别：
#   factor_snapshot 是**派生表**（重跑 build-factors 即可重算，整表替换风险低）；
#   equity_fundamental_snapshot 是**原始数据表**——它没有别的来源，只能从 SEC 重拉。
#   本脚本会 TRUNCATE 它。备份文件（backup_*.dump）**确认新数据无误前不要删**。
#
# 用法（本地仓库根目录，Windows git-bash 或 Linux/WSL）：
#   bash scripts/quant/local-import-fundamentals.sh equity_fundamental_snapshot_YYYYMMDD.dump
#   YES=1 bash scripts/quant/local-import-fundamentals.sh <dump>   # 跳过交互确认（CI/无人值守）
#
# 可选环境变量：
#   PGBIN   pg 工具目录（默认 Windows 的 PostgreSQL 17 安装路径）
#   ENVFILE dotenv 文件（默认 .env.local）
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DUMP="${1:-}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "用法: bash scripts/quant/local-import-fundamentals.sh <equity_fundamental_snapshot dump 文件路径>"; exit 1
fi

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PGBIN="${PGBIN:-/c/Program Files/PostgreSQL/17/bin}"
ENVFILE="${ENVFILE:-.env.local}"
if [ ! -f "$ENVFILE" ]; then
  echo "找不到 $ENVFILE（worktree 里没有就从主检出 copy 一份）"; exit 1
fi
DBURL=$(grep '^DATABASE_URL=' "$ENVFILE" | cut -d= -f2- | tr -d '"' | sed 's/?.*//')
BK="backup_equity_fundamental_snapshot_$(date +%Y%m%d_%H%M%S).dump"

BEFORE=$("$PGBIN/psql" "$DBURL" -tAc "SELECT count(*) FROM mds.equity_fundamental_snapshot")
cat <<EOF
────────────────────────────────────────────────────────────────
⚠️  即将**整表替换原始数据表** mds.equity_fundamental_snapshot
    当前行数 : $BEFORE
    导入文件 : $DUMP
    备份到   : $BK （确认无误前不要删——这张表没有别的来源，只能从 SEC 重拉）
────────────────────────────────────────────────────────────────
EOF
if [ -z "${YES:-}" ]; then
  printf "确认继续？输入 yes 回车："
  read -r ans
  [ "$ans" = "yes" ] || { echo "已取消"; exit 1; }
fi

echo "== 备份当前表 → $BK =="
"$PGBIN/pg_dump" "$DBURL" -t mds.equity_fundamental_snapshot --data-only --no-owner -Fc -f "$BK"

echo "== 删非主键索引 + 清空 =="
"$PGBIN/psql" "$DBURL" -c "
  DROP INDEX IF EXISTS mds.equity_fundamental_snapshot_as_of_idx;
  DROP INDEX IF EXISTS mds.equity_fundamental_snapshot_symbol_idx;
  DROP INDEX IF EXISTS mds.equity_fundamental_snapshot_symbol_period_key;
  DROP INDEX IF EXISTS mds.equity_fundamental_snapshot_symbol_period_type_as_of_idx;
  TRUNCATE mds.equity_fundamental_snapshot;"

echo "== 导入 $DUMP =="
"$PGBIN/pg_restore" --data-only --no-owner -t equity_fundamental_snapshot -d "$DBURL" "$DUMP"

echo "== 重建索引 =="
"$PGBIN/psql" "$DBURL" -c "
  CREATE INDEX equity_fundamental_snapshot_as_of_idx ON mds.equity_fundamental_snapshot USING btree (as_of);
  CREATE INDEX equity_fundamental_snapshot_symbol_idx ON mds.equity_fundamental_snapshot USING btree (symbol);
  CREATE UNIQUE INDEX equity_fundamental_snapshot_symbol_period_key ON mds.equity_fundamental_snapshot USING btree (symbol, period);
  CREATE INDEX equity_fundamental_snapshot_symbol_period_type_as_of_idx ON mds.equity_fundamental_snapshot USING btree (symbol, period_type, as_of);"

echo "== 验证 =="
AFTER=$("$PGBIN/psql" "$DBURL" -tAc "SELECT count(*) FROM mds.equity_fundamental_snapshot")
"$PGBIN/psql" "$DBURL" -tAc "
  SELECT 'rows='||count(*)||' symbols='||count(distinct symbol)||
         ' Q='||count(*) FILTER (WHERE period_type='Q')||
         ' minFiscal='||coalesce(min(fiscal_date)::text,'-')||
         ' 2012Q覆盖='||count(distinct symbol) FILTER (WHERE period_type='Q' AND fiscal_date < '2013-01-01')
  FROM mds.equity_fundamental_snapshot"
echo "行数 $BEFORE → $AFTER"
if [ "$AFTER" -lt "$BEFORE" ]; then
  echo "⚠️  导入后行数变少了——核对来源 dump 是否完整；回滚："
  echo "    pg_restore --data-only --no-owner -t equity_fundamental_snapshot -d \"\$DBURL\" $BK （先 TRUNCATE）"
  exit 1
fi
echo "✅ DONE（备份在 $BK，确认无误后可删）"
echo "下一步：npm run quant:build-factors -- --full --from=2010-01"
