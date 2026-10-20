CREATE TABLE "public"."UserMarketDrawing" (
  "userId" TEXT NOT NULL,
  "scope" VARCHAR(160) NOT NULL,
  "drawings" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserMarketDrawing_pkey" PRIMARY KEY ("userId", "scope"),
  CONSTRAINT "UserMarketDrawing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
