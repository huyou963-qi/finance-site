-- 自建流量统计：页面浏览埋点（不存 IP）
CREATE TABLE IF NOT EXISTS "public"."page_view" (
  "id" BIGSERIAL NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "path" VARCHAR(300) NOT NULL,
  "visitor_id" VARCHAR(64) NOT NULL,
  "session_id" VARCHAR(64) NOT NULL,
  "is_entry" BOOLEAN NOT NULL DEFAULT false,
  "referrer_host" VARCHAR(255),
  "device" VARCHAR(16) NOT NULL,
  "user_id" TEXT,

  CONSTRAINT "page_view_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "page_view_created_at_idx"
  ON "public"."page_view"("created_at");
CREATE INDEX IF NOT EXISTS "page_view_visitor_id_created_at_idx"
  ON "public"."page_view"("visitor_id", "created_at");
