-- Phase 2 季度基本面：equity_fundamental_snapshot 加 period_type 与三大报表标准化列（全部 additive）
ALTER TABLE "mds"."equity_fundamental_snapshot"
  ADD COLUMN IF NOT EXISTS "period_type" VARCHAR(8) NOT NULL DEFAULT 'FY',
  ADD COLUMN IF NOT EXISTS "net_income" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "ocf" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "capex" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "total_assets" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "total_liabilities" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "equity" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "long_term_debt" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "cash" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "shares_outstanding" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "dividends_paid" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "fiscal_date" DATE;

CREATE INDEX IF NOT EXISTS "equity_fundamental_snapshot_symbol_period_type_as_of_idx"
  ON "mds"."equity_fundamental_snapshot"("symbol", "period_type", "as_of");
