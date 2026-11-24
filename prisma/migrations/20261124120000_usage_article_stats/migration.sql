-- AlterTable
ALTER TABLE "public"."usage_event" ADD COLUMN "article_slug" VARCHAR(128);

-- CreateIndex
CREATE INDEX "usage_event_article_slug_created_at_idx" ON "public"."usage_event"("article_slug", "created_at");

-- CreateTable
CREATE TABLE "public"."usage_article_daily_agg" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "audience" VARCHAR(16) NOT NULL,
    "article_slug" VARCHAR(128) NOT NULL,
    "uv" INTEGER NOT NULL DEFAULT 0,
    "pv" INTEGER NOT NULL DEFAULT 0,
    "session_count" INTEGER NOT NULL DEFAULT 0,
    "active_ms_sum" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_article_daily_agg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_article_daily_agg_date_idx" ON "public"."usage_article_daily_agg"("date");

-- CreateIndex
CREATE INDEX "usage_article_daily_agg_article_slug_date_idx" ON "public"."usage_article_daily_agg"("article_slug", "date");

-- CreateIndex
CREATE UNIQUE INDEX "usage_article_daily_agg_date_audience_article_slug_key" ON "public"."usage_article_daily_agg"("date", "audience", "article_slug");

-- Backfill article_slug from path for existing detail-page events
UPDATE "public"."usage_event"
SET "article_slug" = substring(path from '^/articles/([^/]+)$')
WHERE "article_slug" IS NULL
  AND path ~ '^/articles/[^/]+$'
  AND substring(path from '^/articles/([^/]+)$') NOT IN ('editor', 'preview', 'charts', 'connections');
