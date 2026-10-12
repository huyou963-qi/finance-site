-- AlterTable
ALTER TABLE "public"."UserMarketWatchlistItem" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "public"."UserMarketWatchlistGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMarketWatchlistGroup_pkey" PRIMARY KEY ("userId","id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMarketWatchlistGroup_userId_name_key" ON "public"."UserMarketWatchlistGroup"("userId", "name");

-- AddForeignKey
ALTER TABLE "public"."UserMarketWatchlistItem" ADD CONSTRAINT "UserMarketWatchlistItem_userId_groupId_fkey" FOREIGN KEY ("userId", "groupId") REFERENCES "public"."UserMarketWatchlistGroup"("userId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserMarketWatchlistGroup" ADD CONSTRAINT "UserMarketWatchlistGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
