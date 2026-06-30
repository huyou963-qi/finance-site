-- CreateTable
CREATE TABLE "public"."weekly_report" (
    "id" TEXT NOT NULL,
    "week_ending" DATE NOT NULL,
    "meta" JSONB NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_report_week_ending_key" ON "public"."weekly_report"("week_ending");

-- CreateIndex
CREATE INDEX "weekly_report_week_ending_idx" ON "public"."weekly_report"("week_ending" DESC);
