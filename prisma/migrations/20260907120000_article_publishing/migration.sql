CREATE TABLE "public"."research_article" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" TEXT NOT NULL,
    "category" VARCHAR(64) NOT NULL DEFAULT 'policy-analysis',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "body_markdown" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "data_cutoff" TIMESTAMP(3),
    "source_manifest" JSONB NOT NULL,
    "author_id" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "research_article_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."research_article_asset" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(64) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "data" BYTEA NOT NULL,
    "source_kind" VARCHAR(32) NOT NULL,
    "source_url" TEXT,
    "source_config" JSONB,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "research_article_asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "research_article_slug_key" ON "public"."research_article"("slug");
CREATE INDEX "research_article_status_published_at_idx" ON "public"."research_article"("status", "published_at" DESC);
CREATE INDEX "research_article_author_id_updated_at_idx" ON "public"."research_article"("author_id", "updated_at" DESC);
CREATE INDEX "research_article_asset_article_id_created_at_idx" ON "public"."research_article_asset"("article_id", "created_at");

ALTER TABLE "public"."research_article" ADD CONSTRAINT "research_article_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."research_article_asset" ADD CONSTRAINT "research_article_asset_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."research_article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."research_article_asset" ADD CONSTRAINT "research_article_asset_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
