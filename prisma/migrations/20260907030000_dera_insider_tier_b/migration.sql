-- Tier B：SEC DERA 全市场内部人交易底座（三张新表，不触碰任何既有对象）

-- CreateTable
CREATE TABLE "mds"."dera_insider_filing" (
    "accession" VARCHAR(32) NOT NULL,
    "filing_date" DATE NOT NULL,
    "period_of_report" DATE,
    "document_type" VARCHAR(8) NOT NULL,
    "issuer_cik" VARCHAR(16) NOT NULL,
    "issuer_name" VARCHAR(256) NOT NULL,
    "issuer_symbol" VARCHAR(16) NOT NULL,
    "plan_10b5_1" BOOLEAN,
    "source_quarter" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

CONSTRAINT "dera_insider_filing_pkey" PRIMARY KEY ("accession")
);

-- CreateTable
CREATE TABLE "mds"."dera_insider_transaction" (
    "accession" VARCHAR(32) NOT NULL,
    "trans_sk" BIGINT NOT NULL,
    "issuer_cik" VARCHAR(16) NOT NULL,
    "issuer_symbol" VARCHAR(16) NOT NULL,
    "security_title" VARCHAR(256),
    "transaction_date" DATE NOT NULL,
    "filed_at" DATE NOT NULL,
    "transaction_code" VARCHAR(4) NOT NULL,
    "acquired_disposed_code" VARCHAR(1),
    "shares" DOUBLE PRECISION NOT NULL,
    "price_per_share" DOUBLE PRECISION,
    "shares_owned_after" DOUBLE PRECISION,
    "direct_indirect" VARCHAR(1),
    "nature_of_ownership" VARCHAR(512),
    "anomaly" VARCHAR(32),

CONSTRAINT "dera_insider_transaction_pkey" PRIMARY KEY ("accession","trans_sk")
);

-- CreateTable
CREATE TABLE "mds"."dera_insider_owner" (
    "accession" VARCHAR(32) NOT NULL,
    "owner_cik" VARCHAR(16) NOT NULL,
    "owner_name" VARCHAR(256),
    "is_director" BOOLEAN NOT NULL DEFAULT false,
    "is_officer" BOOLEAN NOT NULL DEFAULT false,
    "is_ten_percent_owner" BOOLEAN NOT NULL DEFAULT false,
    "is_other" BOOLEAN NOT NULL DEFAULT false,
    "officer_title" VARCHAR(256),

CONSTRAINT "dera_insider_owner_pkey" PRIMARY KEY ("accession","owner_cik")
);

-- CreateIndex
CREATE INDEX "dera_insider_filing_issuer_symbol_filing_date_idx" ON "mds"."dera_insider_filing"("issuer_symbol", "filing_date" DESC);

-- CreateIndex
CREATE INDEX "dera_insider_filing_issuer_cik_filing_date_idx" ON "mds"."dera_insider_filing"("issuer_cik", "filing_date" DESC);

-- CreateIndex
CREATE INDEX "dera_insider_filing_source_quarter_idx" ON "mds"."dera_insider_filing"("source_quarter");

-- CreateIndex
CREATE INDEX "dera_insider_transaction_issuer_symbol_transaction_date_idx" ON "mds"."dera_insider_transaction"("issuer_symbol", "transaction_date" DESC);

-- CreateIndex
CREATE INDEX "dera_insider_transaction_transaction_code_transaction_date_idx" ON "mds"."dera_insider_transaction"("transaction_code", "transaction_date");

-- CreateIndex
CREATE INDEX "dera_insider_transaction_filed_at_idx" ON "mds"."dera_insider_transaction"("filed_at");

-- CreateIndex
CREATE INDEX "dera_insider_owner_owner_cik_idx" ON "mds"."dera_insider_owner"("owner_cik");

-- CreateIndex
CREATE INDEX "dera_insider_owner_owner_name_idx" ON "mds"."dera_insider_owner"("owner_name");

-- AddForeignKey
ALTER TABLE "mds"."dera_insider_transaction" ADD CONSTRAINT "dera_insider_transaction_accession_fkey" FOREIGN KEY ("accession") REFERENCES "mds"."dera_insider_filing"("accession") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mds"."dera_insider_owner" ADD CONSTRAINT "dera_insider_owner_accession_fkey" FOREIGN KEY ("accession") REFERENCES "mds"."dera_insider_filing"("accession") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "dera_insider_transaction_anomaly_idx" ON "mds"."dera_insider_transaction"("anomaly");
