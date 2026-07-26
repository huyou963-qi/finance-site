-- AlterTable
ALTER TABLE "User" ADD COLUMN "plan_expires_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "trial_ends_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "credit_balance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payment_order" (
    "id" TEXT NOT NULL,
    "order_no" VARCHAR(32) NOT NULL,
    "user_id" TEXT NOT NULL,
    "product_type" VARCHAR(32) NOT NULL,
    "period" VARCHAR(16),
    "amount_cny" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "channel" VARCHAR(16) NOT NULL DEFAULT 'manual',
    "manual_note" VARCHAR(512),
    "external_id" VARCHAR(128),
    "paid_at" TIMESTAMP(3),
    "confirmed_by" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "payment_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger_entry" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "order_id" VARCHAR(64),
    "note" VARCHAR(256),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_order_order_no_key" ON "payment_order"("order_no");
CREATE INDEX "payment_order_user_id_status_idx" ON "payment_order"("user_id", "status");
CREATE INDEX "payment_order_status_created_at_idx" ON "payment_order"("status", "created_at");
CREATE INDEX "credit_ledger_entry_user_id_created_at_idx" ON "credit_ledger_entry"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "payment_order" ADD CONSTRAINT "payment_order_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
