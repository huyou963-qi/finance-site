-- 行业因子月频聚合（Phase 1 WS4）
CREATE TABLE IF NOT EXISTS "mds"."factor_sector_snapshot" (
  "id" UUID NOT NULL,
  "sector" VARCHAR(64) NOT NULL,
  "date" DATE NOT NULL,
  "factor_key" VARCHAR(32) NOT NULL,
  "median" DOUBLE PRECISION NOT NULL,
  "p25" DOUBLE PRECISION NOT NULL,
  "p75" DOUBLE PRECISION NOT NULL,
  "coverage" DOUBLE PRECISION NOT NULL,
  "sample_count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "factor_sector_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "factor_sector_snapshot_sector_date_factor_key_key"
  ON "mds"."factor_sector_snapshot"("sector", "date", "factor_key");
CREATE INDEX IF NOT EXISTS "factor_sector_snapshot_date_factor_key_idx"
  ON "mds"."factor_sector_snapshot"("date", "factor_key");
