-- PIT：该季数据首次向市场披露日（各字段来源事实点最早 filed 的 max；值仍取最新重述口径）
ALTER TABLE "mds"."equity_fundamental_snapshot"
  ADD COLUMN IF NOT EXISTS "first_reported_at" DATE;
