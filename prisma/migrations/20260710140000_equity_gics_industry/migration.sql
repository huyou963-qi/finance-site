-- AlterTable: GICS Industry 级字段
ALTER TABLE "mds"."equity_security"
  ADD COLUMN IF NOT EXISTS "gics_industry_group" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "gics_industry_code" VARCHAR(16);

CREATE INDEX IF NOT EXISTS "equity_security_gics_sector_gics_industry_idx"
  ON "mds"."equity_security"("gics_sector", "gics_industry");

CREATE INDEX IF NOT EXISTS "equity_security_gics_industry_code_idx"
  ON "mds"."equity_security"("gics_industry_code");
