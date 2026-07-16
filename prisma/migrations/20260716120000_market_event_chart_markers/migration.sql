-- CreateEnum
CREATE TYPE "public"."EventScope" AS ENUM ('COUNTRY', 'INDUSTRY', 'COMPANY', 'CROSS');

-- AlterTable
ALTER TABLE "public"."market_event"
  ADD COLUMN "scope" "public"."EventScope" NOT NULL DEFAULT 'CROSS',
  ADD COLUMN "persons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "institutions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "marker_label" VARCHAR(16),
  ADD COLUMN "source_kind" VARCHAR(32),
  ADD COLUMN "external_id" VARCHAR(128);

-- CreateIndex
CREATE INDEX "market_event_scope_idx" ON "public"."market_event"("scope");

-- CreateIndex
CREATE INDEX "market_event_source_kind_external_id_idx" ON "public"."market_event"("source_kind", "external_id");

-- Partial unique: idempotent Skill / import upserts when both keys present
CREATE UNIQUE INDEX "market_event_source_kind_external_id_uidx"
  ON "public"."market_event"("source_kind", "external_id")
  WHERE "source_kind" IS NOT NULL AND "external_id" IS NOT NULL;
