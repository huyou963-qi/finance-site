-- 宏观 regime 月频分类（Phase 4 WS3）：增长×通胀四象限 + NBER 衰退真值 overlay
CREATE TABLE IF NOT EXISTS "mds"."macro_regime" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "growth_state" VARCHAR(16) NOT NULL,
  "inflation_state" VARCHAR(16) NOT NULL,
  "regime" VARCHAR(24) NOT NULL,
  "recession" INTEGER NOT NULL,
  "inputs" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "macro_regime_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "macro_regime_date_key"
  ON "mds"."macro_regime"("date");
CREATE INDEX IF NOT EXISTS "macro_regime_date_idx"
  ON "mds"."macro_regime"("date");
