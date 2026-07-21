-- 回测运行记录（Phase 3 WS3）：run 主表 + NAV 序列 + 逐期持仓
CREATE TABLE IF NOT EXISTS "mds"."backtest_run" (
  "id" UUID NOT NULL,
  "user_id" TEXT,
  "name" VARCHAR(128) NOT NULL,
  "strategy_config" JSONB NOT NULL,
  "params" JSONB NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
  "metrics" JSONB,
  "summary" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),

  CONSTRAINT "backtest_run_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "backtest_run_user_id_created_at_idx"
  ON "mds"."backtest_run"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "backtest_run_status_idx"
  ON "mds"."backtest_run"("status");

CREATE TABLE IF NOT EXISTS "mds"."backtest_nav" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "nav" DOUBLE PRECISION NOT NULL,
  "bench_nav" DOUBLE PRECISION,

  CONSTRAINT "backtest_nav_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "backtest_nav_run_id_fkey" FOREIGN KEY ("run_id")
    REFERENCES "mds"."backtest_run"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "backtest_nav_run_id_date_key"
  ON "mds"."backtest_nav"("run_id", "date");
CREATE INDEX IF NOT EXISTS "backtest_nav_run_id_date_idx"
  ON "mds"."backtest_nav"("run_id", "date");

CREATE TABLE IF NOT EXISTS "mds"."backtest_position" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "rebalance_date" DATE NOT NULL,
  "symbol" VARCHAR(16) NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL,
  "entry_price" DOUBLE PRECISION,
  "exit_reason" VARCHAR(16),

  CONSTRAINT "backtest_position_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "backtest_position_run_id_fkey" FOREIGN KEY ("run_id")
    REFERENCES "mds"."backtest_run"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "backtest_position_run_id_rebalance_date_idx"
  ON "mds"."backtest_position"("run_id", "rebalance_date");
