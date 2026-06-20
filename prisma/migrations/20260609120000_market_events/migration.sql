-- CreateEnum
CREATE TYPE "public"."EventImportance" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."EventDatePrecision" AS ENUM ('DATE', 'DATETIME');

-- CreateTable
CREATE TABLE "public"."market_event" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(256),
    "content" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "date_precision" "public"."EventDatePrecision" NOT NULL DEFAULT 'DATE',
    "importance" "public"."EventImportance" NOT NULL DEFAULT 'MEDIUM',
    "event_type" VARCHAR(64),
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "macro_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_url" VARCHAR(512),
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_event_occurred_at_idx" ON "public"."market_event"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "market_event_importance_idx" ON "public"."market_event"("importance");

-- AddForeignKey
ALTER TABLE "public"."market_event" ADD CONSTRAINT "market_event_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
