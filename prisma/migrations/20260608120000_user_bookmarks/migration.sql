-- CreateTable
CREATE TABLE "public"."UserBookmarkState" (
    "userId" TEXT NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "UserBookmarkState_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "public"."UserBookmarkState" ADD CONSTRAINT "UserBookmarkState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
