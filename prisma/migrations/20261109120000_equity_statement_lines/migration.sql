-- Full three-statement template: extra standardized lines per quarter as {code: value}.
-- Nullable JSONB, no default, so existing rows are not rewritten.
ALTER TABLE "mds"."equity_fundamental_snapshot" ADD COLUMN "lines" JSONB;
