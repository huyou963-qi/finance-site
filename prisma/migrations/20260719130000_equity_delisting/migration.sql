-- 退市/移出清单：从 SP500 历史成分消失的 symbol 反推（消除回测幸存者偏差）
CREATE TABLE IF NOT EXISTS "mds"."equity_delisting" (
  "id" UUID NOT NULL,
  "symbol" VARCHAR(16) NOT NULL,
  "delist_date" DATE NOT NULL,
  "reason" VARCHAR(512),
  "last_price_date" DATE,
  "price_status" VARCHAR(16),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "equity_delisting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "equity_delisting_symbol_key" ON "mds"."equity_delisting"("symbol");
CREATE INDEX IF NOT EXISTS "equity_delisting_delist_date_idx" ON "mds"."equity_delisting"("delist_date");
