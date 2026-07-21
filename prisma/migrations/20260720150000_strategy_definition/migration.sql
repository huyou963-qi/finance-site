-- 选股器策略定义（Phase 2 WS2）：一用户多行；config = ScreenerConfig JSON
CREATE TABLE IF NOT EXISTS "public"."strategy_definition" (
  "id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "config" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "strategy_definition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strategy_definition_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "strategy_definition_user_id_idx"
  ON "public"."strategy_definition"("user_id");
