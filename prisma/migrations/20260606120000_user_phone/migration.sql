-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- AlterTable
ALTER TABLE "PendingRegistration" ADD COLUMN "phone" TEXT NOT NULL DEFAULT '';

-- Backfill existing pending rows (none expected with real phone); drop default after.
ALTER TABLE "PendingRegistration" ALTER COLUMN "phone" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "PendingRegistration_phone_idx" ON "PendingRegistration"("phone");
