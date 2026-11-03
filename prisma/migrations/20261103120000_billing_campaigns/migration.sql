ALTER TABLE public.payment_order ALTER COLUMN amount_cny TYPE DOUBLE PRECISION;
ALTER TABLE public.payment_order ADD COLUMN pricing_snapshot JSONB;
CREATE TABLE public.billing_configuration (
  id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
  draft JSONB NOT NULL, live JSONB NOT NULL, updated_at TIMESTAMP(3) NOT NULL
);
CREATE TABLE public.billing_configuration_audit (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_username TEXT NOT NULL,
  action TEXT NOT NULL, reason VARCHAR(500) NOT NULL,
  before JSONB NOT NULL, after JSONB NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
