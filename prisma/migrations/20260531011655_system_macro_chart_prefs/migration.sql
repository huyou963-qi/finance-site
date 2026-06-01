-- AlterTable
ALTER TABLE "mds"."MacroCategory" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "public"."SystemMacroChartPrefs" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "prefs" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemMacroChartPrefs_pkey" PRIMARY KEY ("id")
);
