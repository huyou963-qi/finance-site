-- CreateTable
CREATE TABLE "mds"."insider_transaction" (
    "id" UUID NOT NULL,
    "cik" VARCHAR(16) NOT NULL,
    "symbol" VARCHAR(16),
    "accession" VARCHAR(32) NOT NULL,
    "filer_cik" VARCHAR(16) NOT NULL,
    "filer_name" VARCHAR(256),
    "is_director" BOOLEAN NOT NULL DEFAULT false,
    "is_officer" BOOLEAN NOT NULL DEFAULT false,
    "is_ten_percent_owner" BOOLEAN NOT NULL DEFAULT false,
    "officer_title" VARCHAR(128),
    "transaction_date" DATE NOT NULL,
    "transaction_code" VARCHAR(4) NOT NULL,
    "acquired_disposed_code" VARCHAR(1) NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "price_per_share" DOUBLE PRECISION,
    "shares_owned_after" DOUBLE PRECISION,
    "line_index" INTEGER NOT NULL,
    "filed_at" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insider_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insider_transaction_symbol_transaction_date_idx" ON "mds"."insider_transaction"("symbol", "transaction_date" DESC);

-- CreateIndex
CREATE INDEX "insider_transaction_cik_transaction_date_idx" ON "mds"."insider_transaction"("cik", "transaction_date" DESC);

-- CreateIndex
CREATE INDEX "insider_transaction_filed_at_idx" ON "mds"."insider_transaction"("filed_at");

-- CreateIndex
CREATE UNIQUE INDEX "insider_transaction_accession_line_index_key" ON "mds"."insider_transaction"("accession", "line_index");
