ALTER TABLE "public"."User" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "User_tags_idx" ON "public"."User" USING GIN ("tags");
