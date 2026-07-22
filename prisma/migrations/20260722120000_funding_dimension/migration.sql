-- Phase 5 资金面维度：机构持仓(13F) / 空头利益 / ETF 资金流 三原始表 + EquitySecurity.cusip

-- EquitySecurity 加 CUSIP 列（13F CUSIP↔symbol 桥回填缓存）
ALTER TABLE "mds"."equity_security" ADD COLUMN IF NOT EXISTS "cusip" VARCHAR(16);
CREATE INDEX IF NOT EXISTS "equity_security_cusip_idx" ON "mds"."equity_security"("cusip");

-- 机构持仓（13F INFOTABLE，逐 filer×证券×报告期）
CREATE TABLE IF NOT EXISTS "mds"."institutional_holding" (
  "id" UUID NOT NULL,
  "cusip" VARCHAR(16) NOT NULL,
  "symbol" VARCHAR(16),
  "filer_cik" VARCHAR(16) NOT NULL,
  "filer_name" VARCHAR(256),
  "period_end" DATE NOT NULL,
  "filed_at" DATE NOT NULL,
  "submission_type" VARCHAR(16) NOT NULL,
  "is_amendment" BOOLEAN NOT NULL DEFAULT false,
  "shares" DOUBLE PRECISION NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "accession" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "institutional_holding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "institutional_holding_accession_cusip_key"
  ON "mds"."institutional_holding"("accession", "cusip");
CREATE INDEX IF NOT EXISTS "institutional_holding_symbol_period_end_idx"
  ON "mds"."institutional_holding"("symbol", "period_end");
CREATE INDEX IF NOT EXISTS "institutional_holding_cusip_period_end_idx"
  ON "mds"."institutional_holding"("cusip", "period_end");
CREATE INDEX IF NOT EXISTS "institutional_holding_period_end_filed_at_idx"
  ON "mds"."institutional_holding"("period_end", "filed_at");
CREATE INDEX IF NOT EXISTS "institutional_holding_filer_cik_period_end_idx"
  ON "mds"."institutional_holding"("filer_cik", "period_end");

-- 空头利益（双周结算，PIT via publish_date）
CREATE TABLE IF NOT EXISTS "mds"."short_interest" (
  "id" UUID NOT NULL,
  "symbol" VARCHAR(16) NOT NULL,
  "settlement_date" DATE NOT NULL,
  "publish_date" DATE NOT NULL,
  "shares" DOUBLE PRECISION NOT NULL,
  "avg_daily_vol" DOUBLE PRECISION,
  "days_to_cover" DOUBLE PRECISION,
  "source" VARCHAR(24),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "short_interest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "short_interest_symbol_settlement_date_key"
  ON "mds"."short_interest"("symbol", "settlement_date");
CREATE INDEX IF NOT EXISTS "short_interest_symbol_settlement_date_idx"
  ON "mds"."short_interest"("symbol", "settlement_date" DESC);
CREATE INDEX IF NOT EXISTS "short_interest_settlement_date_idx"
  ON "mds"."short_interest"("settlement_date");

-- ETF 资金流（前向快照 + 板块代理）
CREATE TABLE IF NOT EXISTS "mds"."etf_flow" (
  "id" UUID NOT NULL,
  "etf_symbol" VARCHAR(16) NOT NULL,
  "date" DATE NOT NULL,
  "shares_outstanding" DOUBLE PRECISION,
  "nav" DOUBLE PRECISION,
  "flow_usd" DOUBLE PRECISION,
  "source" VARCHAR(24),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "etf_flow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "etf_flow_etf_symbol_date_key"
  ON "mds"."etf_flow"("etf_symbol", "date");
CREATE INDEX IF NOT EXISTS "etf_flow_etf_symbol_date_idx"
  ON "mds"."etf_flow"("etf_symbol", "date" DESC);
