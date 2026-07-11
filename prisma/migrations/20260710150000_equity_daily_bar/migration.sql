-- CreateTable: 美股个股/ETF 日线回补缓存
CREATE TABLE IF NOT EXISTS "mds"."equity_daily_bar" (
  "id" UUID NOT NULL,
  "symbol" VARCHAR(16) NOT NULL,
  "date" DATE NOT NULL,
  "open" DOUBLE PRECISION,
  "high" DOUBLE PRECISION,
  "low" DOUBLE PRECISION,
  "close" DOUBLE PRECISION NOT NULL,
  "adj_close" DOUBLE PRECISION NOT NULL,
  "volume" DOUBLE PRECISION,
  "source" VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "equity_daily_bar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "equity_daily_bar_symbol_date_key"
  ON "mds"."equity_daily_bar"("symbol", "date");

CREATE INDEX IF NOT EXISTS "equity_daily_bar_symbol_date_idx"
  ON "mds"."equity_daily_bar"("symbol", "date" DESC);
