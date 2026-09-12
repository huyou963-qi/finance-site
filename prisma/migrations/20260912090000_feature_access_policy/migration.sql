-- 功能页可见性策略：管理员配置普通用户 / Pro 用户分别能看到哪些功能页；全局单例 id=default
CREATE TABLE IF NOT EXISTS "public"."feature_access_policy" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "policy" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT,

  CONSTRAINT "feature_access_policy_pkey" PRIMARY KEY ("id")
);
