ALTER TABLE "public"."User"
ADD COLUMN "marketWatchlistStockOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
