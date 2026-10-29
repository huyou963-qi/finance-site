-- CreateTable
CREATE TABLE "public"."PrivateEventPack" (
    "userId" TEXT NOT NULL,
    "packId" VARCHAR(128) NOT NULL,
    "pack" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "deliveryId" VARCHAR(128) NOT NULL,
    "deliveryHash" VARCHAR(64) NOT NULL,
    "receipt" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateEventPack_pkey" PRIMARY KEY ("userId","packId")
);

-- CreateTable
CREATE TABLE "public"."EventDeliveryCredential" (
    "userId" TEXT NOT NULL,
    "packId" VARCHAR(128) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDeliveryCredential_pkey" PRIMARY KEY ("userId","packId")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventDeliveryCredential_tokenHash_key" ON "public"."EventDeliveryCredential"("tokenHash");

-- AddForeignKey
ALTER TABLE "public"."PrivateEventPack" ADD CONSTRAINT "PrivateEventPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventDeliveryCredential" ADD CONSTRAINT "EventDeliveryCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

