-- 全美股覆盖：gics_sector 改可空。标普 500 成分保留 GICS；全宇宙其余成分为 null（未分类）。
-- NOT NULL → NULL 无数据损失。
ALTER TABLE "mds"."equity_security" ALTER COLUMN "gics_sector" DROP NOT NULL;
