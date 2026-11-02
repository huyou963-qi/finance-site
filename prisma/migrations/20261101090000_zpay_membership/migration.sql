ALTER TABLE public.payment_order
 ADD COLUMN payment_method VARCHAR(16),
 ADD COLUMN merchant_id VARCHAR(64),
 ADD COLUMN idempotency_key VARCHAR(64),
 ADD COLUMN provider_trade_no VARCHAR(128),
 ADD COLUMN fulfilled_at TIMESTAMP(3),
 ADD COLUMN last_checked_at TIMESTAMP(3),
 ADD COLUMN next_check_at TIMESTAMP(3),
 ADD COLUMN check_attempts INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN last_error_code VARCHAR(64);
CREATE UNIQUE INDEX payment_order_provider_trade_no_key ON public.payment_order(provider_trade_no);
CREATE UNIQUE INDEX payment_order_user_id_idempotency_key_key ON public.payment_order(user_id, idempotency_key);
CREATE INDEX payment_order_channel_next_check_at_idx ON public.payment_order(channel, next_check_at);
CREATE TABLE public.payment_event (
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES public.payment_order(id) ON DELETE CASCADE ON UPDATE CASCADE,
 kind VARCHAR(32) NOT NULL,
 source VARCHAR(24) NOT NULL,
 code VARCHAR(64) NOT NULL,
 details JSONB,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX payment_event_order_id_created_at_idx ON public.payment_event(order_id, created_at);
