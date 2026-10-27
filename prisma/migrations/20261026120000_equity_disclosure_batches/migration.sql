CREATE TABLE "mds"."equity_disclosure_batch" (
  "id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'running',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "from_day" DATE NOT NULL,
  "through_day" DATE NOT NULL,
  "symbols" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "covered_ciks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "failed_ciks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "missing_indexes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "indexed" INTEGER NOT NULL DEFAULT 0,
  "complete" INTEGER NOT NULL DEFAULT 0,
  "pending" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "remaining" INTEGER NOT NULL DEFAULT 0,
  "error" VARCHAR(1000),
  CONSTRAINT "equity_disclosure_batch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "equity_disclosure_batch_started_at_idx" ON "mds"."equity_disclosure_batch"("started_at" DESC);
CREATE INDEX "equity_disclosure_batch_status_started_at_idx" ON "mds"."equity_disclosure_batch"("status", "started_at");
