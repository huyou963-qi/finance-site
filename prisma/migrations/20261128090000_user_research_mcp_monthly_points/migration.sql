ALTER TABLE "public"."User"
ADD COLUMN "research_mcp_monthly_points" INTEGER
CHECK ("research_mcp_monthly_points" >= 0);
