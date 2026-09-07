-- Tier B 价格交叉校验结果列。
--
-- 背景：SEC 原样发布申报人填写的价格，其中量级错位（×10^3 / ×10^6）并不罕见，
-- 且不限于冷门票——LLY 2023-08-28 报 554101（当日真实约 $554）。实测排除既有
-- anomaly 后，仍有约 0.022% 的行贡献了 99.92% 的金额，任何 sum 实为在读这批错行。
--
-- 用 mds.equity_daily_bar 的当期实际股价交叉校验；仅对 P/S（公开市场买卖）判断，
-- 因为 M 的价是行权价、A 是授予价，与市价本就没有可比性。
ALTER TABLE "mds"."dera_insider_transaction" ADD COLUMN "price_check" VARCHAR(16);
CREATE INDEX "dera_insider_transaction_price_check_idx" ON "mds"."dera_insider_transaction"("price_check");
