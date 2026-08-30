CREATE TABLE "public"."investment_case" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "symbol" VARCHAR(16) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "style" VARCHAR(24) NOT NULL DEFAULT 'long_term',
    "status" VARCHAR(24) NOT NULL DEFAULT 'research',
    "horizon" VARCHAR(80),
    "core_thesis" TEXT,
    "next_review_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "investment_case_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."investment_research_version" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "note" VARCHAR(256),
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "investment_research_version_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."investment_catalyst" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "direction" VARCHAR(16) NOT NULL DEFAULT 'neutral',
    "probability" DOUBLE PRECISION,
    "impact" VARCHAR(16) NOT NULL DEFAULT 'medium',
    "status" VARCHAR(20) NOT NULL DEFAULT 'watching',
    "window_start" DATE,
    "window_end" DATE,
    "affected_assets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transmission" TEXT,
    "invalidation" TEXT,
    "actual_outcome" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "investment_catalyst_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."investment_trade_plan" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "direction" VARCHAR(12) NOT NULL DEFAULT 'long',
    "entry_low" DOUBLE PRECISION,
    "entry_high" DOUBLE PRECISION,
    "stop_price" DOUBLE PRECISION,
    "target1" DOUBLE PRECISION,
    "target2" DOUBLE PRECISION,
    "target3" DOUBLE PRECISION,
    "target_weight_pct" DOUBLE PRECISION,
    "risk_pct" DOUBLE PRECISION,
    "time_stop" DATE,
    "thesis" TEXT,
    "invalidation" JSONB,
    "gate_results" JSONB,
    "notes" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "investment_trade_plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."investment_action" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "action_type" VARCHAR(24) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "fee" DOUBLE PRECISION,
    "position_weight_pct" DOUBLE PRECISION,
    "reason_code" VARCHAR(40),
    "thesis_impact" VARCHAR(16),
    "plan_matched" BOOLEAN,
    "note" TEXT,
    "source_kind" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "investment_action_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."investment_review" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "author_kind" VARCHAR(16) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "data_cutoff" TIMESTAMP(3) NOT NULL,
    "model" VARCHAR(64),
    "prompt_version" VARCHAR(32),
    "input_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "investment_review_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "investment_case_user_id_status_updated_at_idx" ON "public"."investment_case"("user_id", "status", "updated_at" DESC);
CREATE INDEX "investment_case_user_id_symbol_idx" ON "public"."investment_case"("user_id", "symbol");
CREATE UNIQUE INDEX "investment_research_version_case_id_version_key" ON "public"."investment_research_version"("case_id", "version");
CREATE INDEX "investment_research_version_case_id_confirmed_at_idx" ON "public"."investment_research_version"("case_id", "confirmed_at" DESC);
CREATE INDEX "investment_catalyst_case_id_status_idx" ON "public"."investment_catalyst"("case_id", "status");
CREATE INDEX "investment_catalyst_case_id_window_end_idx" ON "public"."investment_catalyst"("case_id", "window_end");
CREATE UNIQUE INDEX "investment_trade_plan_case_id_key" ON "public"."investment_trade_plan"("case_id");
CREATE INDEX "investment_action_case_id_occurred_at_idx" ON "public"."investment_action"("case_id", "occurred_at");
CREATE INDEX "investment_review_case_id_created_at_idx" ON "public"."investment_review"("case_id", "created_at" DESC);

ALTER TABLE "public"."investment_case" ADD CONSTRAINT "investment_case_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."investment_research_version" ADD CONSTRAINT "investment_research_version_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."investment_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."investment_catalyst" ADD CONSTRAINT "investment_catalyst_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."investment_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."investment_trade_plan" ADD CONSTRAINT "investment_trade_plan_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."investment_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."investment_action" ADD CONSTRAINT "investment_action_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."investment_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."investment_review" ADD CONSTRAINT "investment_review_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."investment_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
