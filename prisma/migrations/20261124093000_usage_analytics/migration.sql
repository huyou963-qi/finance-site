-- CreateTable
CREATE TABLE "public"."usage_event" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" VARCHAR(16) NOT NULL,
    "audience" VARCHAR(16) NOT NULL,
    "user_id" TEXT,
    "guest_id" VARCHAR(64),
    "session_id" VARCHAR(64) NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "feature_id" VARCHAR(64),
    "active_ms" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."usage_daily_agg" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "audience" VARCHAR(16) NOT NULL,
    "feature_id" VARCHAR(64) NOT NULL DEFAULT '',
    "uv" INTEGER NOT NULL DEFAULT 0,
    "pv" INTEGER NOT NULL DEFAULT 0,
    "session_count" INTEGER NOT NULL DEFAULT 0,
    "active_ms_sum" BIGINT NOT NULL DEFAULT 0,
    "returning_uv" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_daily_agg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_event_created_at_idx" ON "public"."usage_event"("created_at");

-- CreateIndex
CREATE INDEX "usage_event_audience_created_at_idx" ON "public"."usage_event"("audience", "created_at");

-- CreateIndex
CREATE INDEX "usage_event_feature_id_created_at_idx" ON "public"."usage_event"("feature_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_event_user_id_created_at_idx" ON "public"."usage_event"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_event_guest_id_created_at_idx" ON "public"."usage_event"("guest_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_event_session_id_created_at_idx" ON "public"."usage_event"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "usage_daily_agg_date_idx" ON "public"."usage_daily_agg"("date");

-- CreateIndex
CREATE UNIQUE INDEX "usage_daily_agg_date_audience_feature_id_key" ON "public"."usage_daily_agg"("date", "audience", "feature_id");
