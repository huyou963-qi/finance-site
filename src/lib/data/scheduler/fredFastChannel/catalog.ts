/**
 * FRED 序列的「官方首发渠道」（2026-09-22）。
 *
 * FRED 只是转载方：H.15 国债收益率、TIPS 实际收益率、CBOE VIX 都要到下一个营业日才上 FRED，
 * 而原发布机构当天收盘后就公布了**同一组数字**。这里登记的每条映射都逐日核对过：
 * 2024-01 起 679–702 个交易日与 FRED **差值为 0**（npm run data:verify-fred-fast-channel 复核）。
 * 所以这里不是换源、也不是拼接：仪器仍是 sched_fred_*，FRED 已收录的日期一律以 FRED 为准，
 * 官方渠道只补 FRED 尚未收录的最新几天；FRED 收录后自然覆盖（值相同即无修订）。
 *
 * 未登记（没有逐日相等的更快渠道，源头本身就是 T+1）：ICE BofA OAS（ICE 授权仅 FRED 转载）、
 * H.10 汇率与美元指数（美联储次日发布）、SOFR/EFFR（纽约联储次日 8:00 发布）。
 * WTI/布伦特现货（EIA 周更）没有同源更快渠道，市场实时口径用独立标准序列
 * nymex_wti_futures（oilPrices/catalog.ts）/ goldov_c27_brent（BZ=F）。
 */

export const TREASURY_RATES_CSV_BASE =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv";

export type TreasuryCurveType = "daily_treasury_yield_curve" | "daily_treasury_real_yield_curve";

export type FredFastChannel =
  | { kind: "treasury"; curve: TreasuryCurveType; column: string; label: string }
  | { kind: "cboe"; csvUrl: string; label: string };

const par = (column: string): FredFastChannel => ({
  kind: "treasury",
  curve: "daily_treasury_yield_curve",
  column,
  label: `美国财政部每日名义国债收益率曲线（${column}）`,
});
const real = (column: string): FredFastChannel => ({
  kind: "treasury",
  curve: "daily_treasury_real_yield_curve",
  column,
  label: `美国财政部每日实际收益率曲线（${column}）`,
});
const cboe = (symbol: string): FredFastChannel => ({
  kind: "cboe",
  csvUrl: `https://cdn.cboe.com/api/global/us_indices/daily_prices/${symbol}_History.csv`,
  label: `CBOE 官网 ${symbol} 日线收盘`,
});

/** FRED series_id → 官方首发渠道。列名与 CSV 表头逐字一致。 */
export const FRED_FAST_CHANNELS: Readonly<Record<string, FredFastChannel>> = {
  // H.15 固定期限国债收益率（CMT）= 财政部每日名义收益率曲线
  DGS1MO: par("1 Mo"),
  DGS3MO: par("3 Mo"),
  DGS6MO: par("6 Mo"),
  DGS1: par("1 Yr"),
  DGS2: par("2 Yr"),
  DGS3: par("3 Yr"),
  DGS5: par("5 Yr"),
  DGS7: par("7 Yr"),
  DGS10: par("10 Yr"),
  DGS20: par("20 Yr"),
  DGS30: par("30 Yr"),
  // H.15 TIPS 实际收益率 = 财政部每日实际收益率曲线
  DFII5: real("5 YR"),
  DFII7: real("7 YR"),
  DFII10: real("10 YR"),
  DFII20: real("20 YR"),
  DFII30: real("30 YR"),
  // CBOE Market Statistics
  VIXCLS: cboe("VIX"),
  VXVCLS: cboe("VIX3M"),
};

export function fredFastChannelFor(seriesId: string): FredFastChannel | null {
  return FRED_FAST_CHANNELS[seriesId.trim().toUpperCase()] ?? null;
}
