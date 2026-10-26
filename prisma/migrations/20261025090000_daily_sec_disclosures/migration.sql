ALTER TABLE "mds"."sec_filing"
  ADD COLUMN "report_period_end" DATE,
  ADD COLUMN "daily_status" VARCHAR(16),
  ADD COLUMN "daily_processed_at" TIMESTAMP(3),
  ADD COLUMN "daily_next_attempt_at" TIMESTAMP(3),
  ADD COLUMN "daily_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "daily_error" VARCHAR(1000),
  ADD COLUMN "earnings_release" JSONB;
CREATE INDEX "sec_filing_daily_status_daily_next_attempt_at_idx"
  ON "mds"."sec_filing"("daily_status", "daily_next_attempt_at");
