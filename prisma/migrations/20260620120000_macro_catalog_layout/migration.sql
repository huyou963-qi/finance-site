-- CreateTable
CREATE TABLE "public"."macro_catalog_layout" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "layout" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "macro_catalog_layout_pkey" PRIMARY KEY ("id")
);
