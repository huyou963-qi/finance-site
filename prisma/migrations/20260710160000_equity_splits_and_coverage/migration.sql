-- CreateTable: 拆股事件（Yahoo chart events.splits）
CREATE TABLE IF NOT EXISTS "mds"."equity_split" (
  "id" UUID NOT NULL,
  "symbol" VARCHAR(16) NOT NULL,
  "ex_date" DATE NOT NULL,
  "ratio" DOUBLE PRECISION NOT NULL,
  "numerator" DOUBLE PRECISION NOT NULL,
  "denominator" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "equity_split_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "equity_split_symbol_ex_date_key"
  ON "mds"."equity_split"("symbol", "ex_date");

CREATE INDEX IF NOT EXISTS "equity_split_symbol_ex_date_idx"
  ON "mds"."equity_split"("symbol", "ex_date");

-- CreateTable: 每标的日线覆盖状态
CREATE TABLE IF NOT EXISTS "mds"."equity_price_coverage" (
  "symbol" VARCHAR(16) NOT NULL,
  "first_date" DATE,
  "last_date" DATE,
  "full_history" BOOLEAN NOT NULL DEFAULT false,
  "last_checked_at" TIMESTAMP(3),
  "not_found" BOOLEAN NOT NULL DEFAULT false,
  "source" VARCHAR(16),
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "equity_price_coverage_pkey" PRIMARY KEY ("symbol")
);
