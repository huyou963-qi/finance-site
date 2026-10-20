ALTER TABLE "mds"."kline_response_cache" ADD COLUMN "family_key" VARCHAR(64) NOT NULL DEFAULT '';
CREATE INDEX "kline_response_cache_family_key_idx" ON "mds"."kline_response_cache"("family_key");
