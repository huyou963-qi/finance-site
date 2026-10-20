-- Shared response cache only; independent of canonical US daily bars / user data.
CREATE TABLE "mds"."kline_response_cache" (
    "key" VARCHAR(64) NOT NULL,
    "payload" JSONB,
    "payload_bytes" INTEGER NOT NULL DEFAULT 0,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT 'epoch',
    "fresh_until" TIMESTAMPTZ(3) NOT NULL DEFAULT 'epoch',
    "expires_at" TIMESTAMPTZ(3) NOT NULL DEFAULT 'epoch',
    "retry_after" TIMESTAMPTZ(3) NOT NULL DEFAULT 'epoch',
    "lease_owner" VARCHAR(36),
    "lease_until" TIMESTAMPTZ(3) NOT NULL DEFAULT 'epoch',
    "failures" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(300),
    "last_access_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kline_response_cache_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "kline_response_cache_expires_at_idx" ON "mds"."kline_response_cache"("expires_at");
CREATE INDEX "kline_response_cache_last_access_at_idx" ON "mds"."kline_response_cache"("last_access_at");
