-- CreateTable: 期货逐合约日线（期限结构 / 期现差研究；每个交割月一条独立序列）
CREATE TABLE IF NOT EXISTS "mds"."futures_contract_bar" (
  "id" UUID NOT NULL,
  "root" VARCHAR(8) NOT NULL,
  "exchange" VARCHAR(16) NOT NULL,
  "delivery_month" VARCHAR(7) NOT NULL,
  "symbol" VARCHAR(24) NOT NULL,
  "date" DATE NOT NULL,
  "open" DOUBLE PRECISION,
  "high" DOUBLE PRECISION,
  "low" DOUBLE PRECISION,
  "close" DOUBLE PRECISION,
  "settle" DOUBLE PRECISION,
  "volume" DOUBLE PRECISION,
  "open_interest" DOUBLE PRECISION,
  "source" VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "futures_contract_bar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "futures_contract_bar_root_delivery_month_date_source_key"
  ON "mds"."futures_contract_bar"("root", "delivery_month", "date", "source");

CREATE INDEX IF NOT EXISTS "futures_contract_bar_root_date_idx"
  ON "mds"."futures_contract_bar"("root", "date");
