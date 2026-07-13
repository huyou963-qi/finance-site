-- 财季位置（1–4，来自 10-K 年度期末锚定），年度视角按 FQ4 分组对齐公司真实财年
ALTER TABLE "mds"."equity_fundamental_snapshot"
  ADD COLUMN IF NOT EXISTS "fiscal_quarter" SMALLINT;
