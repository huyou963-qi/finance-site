-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "marketWatchlistTabOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
