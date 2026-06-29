-- ReleasePackage Phase B：按官方发布包对齐经济日历

CREATE TABLE "mds"."release_package" (
    "id" VARCHAR(64) NOT NULL,
    "label_zh" VARCHAR(128) NOT NULL,
    "label_en" VARCHAR(128),
    "country_code" VARCHAR(2) NOT NULL,
    "agency_id" VARCHAR(48),
    "granularity" "mds"."DataGranularity" NOT NULL,
    "calendar_spec" JSONB NOT NULL,
    "release_template" JSONB NOT NULL,
    "schedule_state" JSONB,
    "next_run_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_package_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mds"."release_package_member" (
    "id" UUID NOT NULL,
    "package_id" VARCHAR(64) NOT NULL,
    "instrument_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_package_member_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "mds"."data_subscription"
ADD COLUMN "release_package_id" VARCHAR(64);

CREATE UNIQUE INDEX "release_package_member_package_id_instrument_id_key"
ON "mds"."release_package_member"("package_id", "instrument_id");

CREATE UNIQUE INDEX "release_package_member_instrument_id_key"
ON "mds"."release_package_member"("instrument_id");

CREATE INDEX "release_package_country_code_idx" ON "mds"."release_package"("country_code");
CREATE INDEX "release_package_enabled_next_run_at_idx" ON "mds"."release_package"("enabled", "next_run_at");
CREATE INDEX "release_package_member_package_id_idx" ON "mds"."release_package_member"("package_id");
CREATE INDEX "data_subscription_release_package_id_idx" ON "mds"."data_subscription"("release_package_id");

ALTER TABLE "mds"."release_package"
ADD CONSTRAINT "release_package_agency_id_fkey"
FOREIGN KEY ("agency_id") REFERENCES "mds"."statistical_agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mds"."release_package_member"
ADD CONSTRAINT "release_package_member_package_id_fkey"
FOREIGN KEY ("package_id") REFERENCES "mds"."release_package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mds"."release_package_member"
ADD CONSTRAINT "release_package_member_instrument_id_fkey"
FOREIGN KEY ("instrument_id") REFERENCES "mds"."Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mds"."data_subscription"
ADD CONSTRAINT "data_subscription_release_package_id_fkey"
FOREIGN KEY ("release_package_id") REFERENCES "mds"."release_package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
