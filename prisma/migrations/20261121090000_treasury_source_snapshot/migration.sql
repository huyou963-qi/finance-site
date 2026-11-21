CREATE TABLE "mds"."treasury_source_snapshot" (
    "id" UUID NOT NULL,
    "dataset" VARCHAR(32) NOT NULL,
    "record_key" VARCHAR(128) NOT NULL,
    "as_of_date" DATE NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "source_url" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "treasury_source_snapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "treasury_source_snapshot_dataset_record_key_content_hash_key" ON "mds"."treasury_source_snapshot"("dataset", "record_key", "content_hash");
CREATE INDEX "treasury_source_snapshot_dataset_as_of_date_idx" ON "mds"."treasury_source_snapshot"("dataset", "as_of_date");
