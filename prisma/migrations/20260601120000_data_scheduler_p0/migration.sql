-- CreateEnum
CREATE TYPE "mds"."SourceAdapterKind" AS ENUM ('FRED_API', 'WORLD_BANK_API', 'REST_API', 'BULK_FILE', 'MANUAL');

-- CreateEnum
CREATE TYPE "mds"."DataFetchMethod" AS ENUM ('API', 'BULK_DOWNLOAD', 'MANUAL');

-- CreateEnum
CREATE TYPE "mds"."DataGranularity" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'IRREGULAR');

-- CreateEnum
CREATE TYPE "mds"."FetchRunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "mds"."statistical_agency" (
    "id" VARCHAR(48) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "name_zh" VARCHAR(128) NOT NULL,
    "name_en" VARCHAR(128),
    "website_url" VARCHAR(512),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statistical_agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mds"."data_source" (
    "id" VARCHAR(48) NOT NULL,
    "agency_id" VARCHAR(48),
    "name" VARCHAR(128) NOT NULL,
    "adapter_kind" "mds"."SourceAdapterKind" NOT NULL,
    "base_url" VARCHAR(512),
    "terms_url" VARCHAR(512),
    "rate_limit" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mds"."data_subscription" (
    "id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "source_id" VARCHAR(48) NOT NULL,
    "source_series_key" VARCHAR(128) NOT NULL,
    "fetch_method" "mds"."DataFetchMethod" NOT NULL,
    "granularity" "mds"."DataGranularity" NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "release_rule" JSONB NOT NULL,
    "revision_lookback" INTEGER NOT NULL DEFAULT 3,
    "next_run_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_obs_date" DATE,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mds"."fetch_run" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "status" "mds"."FetchRunStatus" NOT NULL,
    "rows_upserted" INTEGER NOT NULL DEFAULT 0,
    "rows_skipped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "source_lag_days" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fetch_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "statistical_agency_country_code_idx" ON "mds"."statistical_agency"("country_code");

-- CreateIndex
CREATE INDEX "data_source_agency_id_idx" ON "mds"."data_source"("agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_subscription_instrument_id_key" ON "mds"."data_subscription"("instrument_id");

-- CreateIndex
CREATE INDEX "data_subscription_source_id_idx" ON "mds"."data_subscription"("source_id");

-- CreateIndex
CREATE INDEX "data_subscription_enabled_next_run_at_idx" ON "mds"."data_subscription"("enabled", "next_run_at");

-- CreateIndex
CREATE INDEX "fetch_run_subscription_id_started_at_idx" ON "mds"."fetch_run"("subscription_id", "started_at");

-- AddForeignKey
ALTER TABLE "mds"."data_source" ADD CONSTRAINT "data_source_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "mds"."statistical_agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mds"."data_subscription" ADD CONSTRAINT "data_subscription_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "mds"."Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mds"."data_subscription" ADD CONSTRAINT "data_subscription_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "mds"."data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mds"."fetch_run" ADD CONSTRAINT "fetch_run_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "mds"."data_subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
