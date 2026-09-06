ALTER TABLE "mds"."sec_filing" ADD COLUMN "ownership_data" JSONB,
  ADD COLUMN "ownership_parsed_at" TIMESTAMP(3);
ALTER TABLE "mds"."insider_transaction" ADD COLUMN "evidence" JSONB;
CREATE TABLE "mds"."ownership_review" (
  "id" UUID NOT NULL, "symbol" VARCHAR(16) NOT NULL, "key" VARCHAR(160) NOT NULL,
  "revision" INTEGER NOT NULL, "kind" VARCHAR(24) NOT NULL, "payload" JSONB NOT NULL,
  "source_url" VARCHAR(1024) NOT NULL, "quote" TEXT NOT NULL,
  "available_at" DATE NOT NULL, "author" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ownership_review_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ownership_review_symbol_key_revision_key" ON "mds"."ownership_review"("symbol","key","revision");
CREATE INDEX "ownership_review_symbol_available_at_idx" ON "mds"."ownership_review"("symbol","available_at");
