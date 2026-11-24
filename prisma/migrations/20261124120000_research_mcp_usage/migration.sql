CREATE TABLE "public"."research_mcp_usage" (
  "user_id" TEXT NOT NULL,
  "month" DATE NOT NULL,
  "used" INTEGER NOT NULL,
  CONSTRAINT "research_mcp_usage_pkey" PRIMARY KEY ("user_id", "month")
);

CREATE TABLE "public"."research_mcp_call" (
  "id" UUID NOT NULL,
  "user_id" TEXT NOT NULL,
  "started_at" TIMESTAMPTZ(3) NOT NULL,
  "lease_until" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "research_mcp_call_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "research_mcp_call_started_at_idx" ON "public"."research_mcp_call"("started_at");
CREATE INDEX "research_mcp_call_user_id_started_at_idx" ON "public"."research_mcp_call"("user_id", "started_at");
