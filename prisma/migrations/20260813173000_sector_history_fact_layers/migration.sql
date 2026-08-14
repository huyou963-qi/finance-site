CREATE TABLE "mds"."equity_fundamental_vintage" (
  "id" UUID NOT NULL, "symbol" VARCHAR(16) NOT NULL, "period" VARCHAR(16) NOT NULL,
  "period_type" VARCHAR(8) NOT NULL DEFAULT 'Q', "accession" VARCHAR(32) NOT NULL,
  "form" VARCHAR(16) NOT NULL, "filed_at" DATE NOT NULL,
  "is_amendment" BOOLEAN NOT NULL DEFAULT false, "fiscal_date" DATE,
  "fiscal_quarter" SMALLINT, "revenue" DOUBLE PRECISION, "revenue_yoy" DOUBLE PRECISION,
  "eps" DOUBLE PRECISION, "eps_yoy" DOUBLE PRECISION, "gross_margin" DOUBLE PRECISION,
  "op_margin" DOUBLE PRECISION, "net_income" DOUBLE PRECISION, "ocf" DOUBLE PRECISION,
  "capex" DOUBLE PRECISION, "total_assets" DOUBLE PRECISION,
  "total_liabilities" DOUBLE PRECISION, "equity" DOUBLE PRECISION,
  "long_term_debt" DOUBLE PRECISION, "cash" DOUBLE PRECISION,
  "shares_outstanding" DOUBLE PRECISION, "dividends_paid" DOUBLE PRECISION,
  "first_reported_at" DATE, "source" VARCHAR(64) NOT NULL DEFAULT 'sec-companyfacts',
  "metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "equity_fundamental_vintage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mds"."equity_sector_classification_history" (
  "id" UUID NOT NULL, "symbol" VARCHAR(16) NOT NULL, "scheme" VARCHAR(32) NOT NULL,
  "sector" VARCHAR(64), "industry_group" VARCHAR(128), "industry" VARCHAR(128),
  "sub_industry" VARCHAR(128), "industry_code" VARCHAR(16), "sic" VARCHAR(8),
  "sic_description" VARCHAR(256), "valid_from" DATE NOT NULL, "valid_to" DATE,
  "source" VARCHAR(128) NOT NULL, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "metadata" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "equity_sector_classification_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "equity_sector_classification_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
  CONSTRAINT "equity_sector_classification_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);

CREATE TABLE "mds"."sector_etf_holding" (
  "id" UUID NOT NULL, "etf" VARCHAR(16) NOT NULL, "as_of_date" DATE NOT NULL,
  "holding_key" VARCHAR(64) NOT NULL, "symbol" VARCHAR(32), "cusip" VARCHAR(16),
  "name" VARCHAR(256) NOT NULL, "weight" DOUBLE PRECISION NOT NULL, "shares" DOUBLE PRECISION,
  "market_value" DOUBLE PRECISION, "source" VARCHAR(128) NOT NULL,
  "source_url" VARCHAR(512), "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sector_etf_holding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sector_etf_holding_weight_check" CHECK ("weight" >= 0 AND "weight" <= 1.05)
);

CREATE UNIQUE INDEX "equity_fundamental_vintage_symbol_period_accession_key" ON "mds"."equity_fundamental_vintage"("symbol", "period", "accession");
CREATE INDEX "equity_fundamental_vintage_symbol_period_filed_at_idx" ON "mds"."equity_fundamental_vintage"("symbol", "period", "filed_at" DESC);
CREATE INDEX "equity_fundamental_vintage_symbol_filed_at_idx" ON "mds"."equity_fundamental_vintage"("symbol", "filed_at");
CREATE INDEX "equity_fundamental_vintage_accession_idx" ON "mds"."equity_fundamental_vintage"("accession");
CREATE UNIQUE INDEX "equity_sector_classification_history_symbol_scheme_valid_from_key" ON "mds"."equity_sector_classification_history"("symbol", "scheme", "valid_from");
CREATE INDEX "equity_sector_classification_history_symbol_scheme_valid_from_valid_to_idx" ON "mds"."equity_sector_classification_history"("symbol", "scheme", "valid_from", "valid_to");
CREATE INDEX "equity_sector_classification_history_scheme_sector_valid_from_idx" ON "mds"."equity_sector_classification_history"("scheme", "sector", "valid_from");
CREATE UNIQUE INDEX "sector_etf_holding_etf_as_of_date_holding_key_key" ON "mds"."sector_etf_holding"("etf", "as_of_date", "holding_key");
CREATE INDEX "sector_etf_holding_etf_as_of_date_idx" ON "mds"."sector_etf_holding"("etf", "as_of_date" DESC);
CREATE INDEX "sector_etf_holding_symbol_as_of_date_idx" ON "mds"."sector_etf_holding"("symbol", "as_of_date");
