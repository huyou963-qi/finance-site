-- 用户错误反馈工单
CREATE TABLE IF NOT EXISTS "public"."error_report" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" VARCHAR(32) NOT NULL DEFAULT 'open',
  "source" VARCHAR(32) NOT NULL,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "page_url" TEXT NOT NULL,
  "user_agent" TEXT,
  "user_note" TEXT,
  "digest" TEXT,
  "user_id" TEXT,
  "username" TEXT,
  "metadata" JSONB,
  "resolved_at" TIMESTAMP(3),
  "resolved_by" TEXT,
  "admin_note" TEXT,

  CONSTRAINT "error_report_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "error_report_status_created_at_idx"
  ON "public"."error_report"("status", "created_at");
CREATE INDEX IF NOT EXISTS "error_report_created_at_idx"
  ON "public"."error_report"("created_at");
