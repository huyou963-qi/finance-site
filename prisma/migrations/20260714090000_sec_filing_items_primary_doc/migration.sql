-- 事件时间线（Phase 3 / P10-A1）：sec_filing 加 8-K items 与主文档直链，全部 nullable additive
ALTER TABLE "mds"."sec_filing" ADD COLUMN IF NOT EXISTS "items" VARCHAR(64);
ALTER TABLE "mds"."sec_filing" ADD COLUMN IF NOT EXISTS "primary_document" VARCHAR(256);
ALTER TABLE "mds"."sec_filing" ADD COLUMN IF NOT EXISTS "primary_doc_description" VARCHAR(256);
