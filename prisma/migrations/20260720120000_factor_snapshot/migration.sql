-- 月频 PIT 因子快照长表（Phase 1 WS1）
CREATE TABLE IF NOT EXISTS "mds"."factor_snapshot" (
  "id" UUID NOT NULL,
  "symbol" VARCHAR(16) NOT NULL,
  "date" DATE NOT NULL,
  "factor_key" VARCHAR(32) NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "zscore" DOUBLE PRECISION,
  "sector_zscore" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "factor_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "factor_snapshot_symbol_date_factor_key_key"
  ON "mds"."factor_snapshot"("symbol", "date", "factor_key");
CREATE INDEX IF NOT EXISTS "factor_snapshot_date_factor_key_idx"
  ON "mds"."factor_snapshot"("date", "factor_key");
