-- 过拟合防护——稳健性分析 run（P2 WS3）。跨参数网格/时间分割的稳健性结果整存 JSONB。
CREATE TABLE IF NOT EXISTS "mds"."robustness_run" (
  "id" UUID NOT NULL,
  "user_id" TEXT,
  "name" VARCHAR(128) NOT NULL,
  "mode" VARCHAR(16) NOT NULL,
  "strategy_config" JSONB NOT NULL,
  "params" JSONB NOT NULL,
  "spec" JSONB NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
  "result" JSONB,
  "summary" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),

  CONSTRAINT "robustness_run_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "robustness_run_user_id_created_at_idx"
  ON "mds"."robustness_run"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "robustness_run_status_idx"
  ON "mds"."robustness_run"("status");
