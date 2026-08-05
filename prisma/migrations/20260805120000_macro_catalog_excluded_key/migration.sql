CREATE TABLE "public"."macro_catalog_excluded_key" (
    "catalog_key" VARCHAR(192) NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_by" VARCHAR(64),

    CONSTRAINT "macro_catalog_excluded_key_pkey" PRIMARY KEY ("catalog_key")
);
