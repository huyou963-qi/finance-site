CREATE TABLE "public"."research_article_comment" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "research_article_comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "research_article_comment_article_id_created_at_idx"
    ON "public"."research_article_comment"("article_id", "created_at" DESC);

CREATE INDEX "research_article_comment_author_id_created_at_idx"
    ON "public"."research_article_comment"("author_id", "created_at" DESC);

ALTER TABLE "public"."research_article_comment"
    ADD CONSTRAINT "research_article_comment_article_id_fkey"
    FOREIGN KEY ("article_id") REFERENCES "public"."research_article"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."research_article_comment"
    ADD CONSTRAINT "research_article_comment_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "public"."User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
