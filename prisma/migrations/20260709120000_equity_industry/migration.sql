-- CreateTable
CREATE TABLE "public"."company_operating_brief" (
    "id" TEXT NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "period_month" VARCHAR(7) NOT NULL,
    "meta" JSONB NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_operating_brief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."industry_peer_resonance" (
    "id" TEXT NOT NULL,
    "peer_group_id" VARCHAR(128) NOT NULL,
    "period_month" VARCHAR(7) NOT NULL,
    "payload" JSONB NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industry_peer_resonance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mds"."equity_security" (
    "id" UUID NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "cik" VARCHAR(16),
    "name" VARCHAR(256) NOT NULL,
    "gics_sector" VARCHAR(64) NOT NULL,
    "gics_industry" VARCHAR(128),
    "gics_sub_industry" VARCHAR(128),
    "market_cap" DOUBLE PRECISION,
    "market_cap_as_of" DATE,
    "ir_url" VARCHAR(512),
    "website" VARCHAR(512),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equity_security_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mds"."index_constituent" (
    "id" UUID NOT NULL,
    "index_code" VARCHAR(32) NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "as_of_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "index_constituent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mds"."equity_fundamental_snapshot" (
    "id" UUID NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "period" VARCHAR(16) NOT NULL,
    "revenue" DOUBLE PRECISION,
    "revenue_yoy" DOUBLE PRECISION,
    "eps" DOUBLE PRECISION,
    "eps_yoy" DOUBLE PRECISION,
    "gross_margin" DOUBLE PRECISION,
    "op_margin" DOUBLE PRECISION,
    "pe" DOUBLE PRECISION,
    "as_of" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equity_fundamental_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mds"."sec_filing" (
    "id" UUID NOT NULL,
    "cik" VARCHAR(16) NOT NULL,
    "symbol" VARCHAR(16),
    "accession" VARCHAR(32) NOT NULL,
    "form" VARCHAR(16) NOT NULL,
    "filed_at" DATE NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_filing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_operating_brief_period_month_idx" ON "public"."company_operating_brief"("period_month" DESC);

-- CreateIndex
CREATE INDEX "company_operating_brief_symbol_idx" ON "public"."company_operating_brief"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "company_operating_brief_symbol_period_month_key" ON "public"."company_operating_brief"("symbol", "period_month");

-- CreateIndex
CREATE INDEX "industry_peer_resonance_period_month_idx" ON "public"."industry_peer_resonance"("period_month" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "industry_peer_resonance_peer_group_id_period_month_key" ON "public"."industry_peer_resonance"("peer_group_id", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "equity_security_symbol_key" ON "mds"."equity_security"("symbol");

-- CreateIndex
CREATE INDEX "equity_security_gics_sector_idx" ON "mds"."equity_security"("gics_sector");

-- CreateIndex
CREATE INDEX "equity_security_market_cap_idx" ON "mds"."equity_security"("market_cap" DESC);

-- CreateIndex
CREATE INDEX "index_constituent_index_code_as_of_date_idx" ON "mds"."index_constituent"("index_code", "as_of_date");

-- CreateIndex
CREATE INDEX "index_constituent_symbol_idx" ON "mds"."index_constituent"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "index_constituent_index_code_symbol_as_of_date_key" ON "mds"."index_constituent"("index_code", "symbol", "as_of_date");

-- CreateIndex
CREATE INDEX "equity_fundamental_snapshot_symbol_idx" ON "mds"."equity_fundamental_snapshot"("symbol");

-- CreateIndex
CREATE INDEX "equity_fundamental_snapshot_as_of_idx" ON "mds"."equity_fundamental_snapshot"("as_of");

-- CreateIndex
CREATE UNIQUE INDEX "equity_fundamental_snapshot_symbol_period_key" ON "mds"."equity_fundamental_snapshot"("symbol", "period");

-- CreateIndex
CREATE INDEX "sec_filing_symbol_filed_at_idx" ON "mds"."sec_filing"("symbol", "filed_at" DESC);

-- CreateIndex
CREATE INDEX "sec_filing_cik_filed_at_idx" ON "mds"."sec_filing"("cik", "filed_at" DESC);

-- CreateIndex
CREATE INDEX "sec_filing_form_idx" ON "mds"."sec_filing"("form");

-- CreateIndex
CREATE UNIQUE INDEX "sec_filing_cik_accession_key" ON "mds"."sec_filing"("cik", "accession");
