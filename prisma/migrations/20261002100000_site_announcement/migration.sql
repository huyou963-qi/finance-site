-- 首页站点公告：管理员配置开关、内容与生效时间；全局单例 id=default
CREATE TABLE IF NOT EXISTS "public"."site_announcement" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "title" VARCHAR(80) NOT NULL,
  "content" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" VARCHAR(64),

  CONSTRAINT "site_announcement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "site_announcement_time_range_check" CHECK ("ends_at" > "starts_at")
);
