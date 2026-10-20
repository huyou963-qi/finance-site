-- CreateTable
CREATE TABLE "public"."UserMarketWatchlistItem" (
    "userId" TEXT NOT NULL,
    "symbol" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "exchange" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMarketWatchlistItem_pkey" PRIMARY KEY ("userId","symbol")
);

-- AddForeignKey
ALTER TABLE "public"."UserMarketWatchlistItem" ADD CONSTRAINT "UserMarketWatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
