ALTER TABLE "mds"."sec_filing"
  ADD COLUMN "acceptance_reported_at" VARCHAR(40),
  ADD COLUMN "accepted_at" TIMESTAMP(3),
  ADD COLUMN "accepted_at_source" VARCHAR(512),
  ADD COLUMN "published_at" TIMESTAMP(3),
  ADD COLUMN "published_on" DATE,
  ADD COLUMN "publication_source" VARCHAR(512),
  ADD COLUMN "timing_checked_at" TIMESTAMP(3);
ALTER TABLE "mds"."equity_disclosure_batch" ADD COLUMN "timing_updated" INTEGER NOT NULL DEFAULT 0;
