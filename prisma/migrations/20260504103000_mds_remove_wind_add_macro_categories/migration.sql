-- 移除 Wind 专用字段；引入本系统编码 code 与 MacroCategory；保留既有 Instrument 行（用哈希回填 code）。

CREATE TABLE "mds"."MacroCategory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(48) NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "MacroCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MacroCategory_code_key" ON "mds"."MacroCategory"("code");

CREATE INDEX "MacroCategory_parent_id_idx" ON "mds"."MacroCategory"("parent_id");

ALTER TABLE "mds"."MacroCategory"
ADD CONSTRAINT "MacroCategory_parent_id_fkey"
FOREIGN KEY ("parent_id") REFERENCES "mds"."MacroCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mds"."Instrument" ADD COLUMN IF NOT EXISTS "code" VARCHAR(48);
ALTER TABLE "mds"."Instrument" ADD COLUMN IF NOT EXISTS "category_id" UUID;
ALTER TABLE "mds"."Instrument" ADD COLUMN IF NOT EXISTS "short_name" TEXT;

UPDATE "mds"."Instrument" SET "short_name" = "shortName" WHERE "short_name" IS NULL AND "shortName" IS NOT NULL;

UPDATE "mds"."Instrument"
SET "code" = 'm_' || md5(COALESCE("wind_wd_id", "id"::text))
WHERE "code" IS NULL;

ALTER TABLE "mds"."Instrument" ALTER COLUMN "code" SET NOT NULL;

DROP INDEX IF EXISTS "mds"."Instrument_wind_wd_id_key";

ALTER TABLE "mds"."Instrument" DROP COLUMN IF EXISTS "wind_wd_id";
ALTER TABLE "mds"."Instrument" DROP COLUMN IF EXISTS "wind_cat_id";
ALTER TABLE "mds"."Instrument" DROP COLUMN IF EXISTS "shortName";

CREATE UNIQUE INDEX "Instrument_code_key" ON "mds"."Instrument"("code");

CREATE INDEX "Instrument_category_id_idx" ON "mds"."Instrument"("category_id");

ALTER TABLE "mds"."Instrument"
ADD CONSTRAINT "Instrument_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "mds"."MacroCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
