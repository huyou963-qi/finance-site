/**
 * 黄金价格——改由行情接口（Yahoo v8 chart，/markets 行情页同源）更新（2026-09-11）。
 *
 * - usov_c05_comex_gold「期货收盘价(连续):COMEX黄金」：原挂 FRED GOLDAMGBD228NLBM（已下架，HTTP 400），
 *   停在 2026-05-29；GC=F 即 COMEX 黄金连续合约，口径一致。
 * - goldov_c02_london_gold「伦敦金现:IDC」：原无订阅、停在 2026-06-05。行情接口无伦敦现货
 *   （XAUUSD=X 已下架），经用户确认改用 GC=F：2026-06-05 前为 IDC 伦敦金现历史，此后为 COMEX
 *   连续期货收盘价（通常高于现货 0.5%–1%），黄金模板「期现差」自此失去期现含义。
 *
 * 只做增量续接（从库内最后观测往后），不覆盖 xlsx 历史。
 */
export const YAHOO_CHART_SOURCE = {
  id: "yahoo-chart",
  agencyId: "yahoo-finance",
  nameZh: "Yahoo Finance 行情（v8 chart）",
  nameEn: "Yahoo Finance",
  name: "Yahoo Finance v8 chart（行情接口）",
  baseUrl: "https://query1.finance.yahoo.com/v8/finance/chart",
  termsUrl: "https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html",
  websiteUrl: "https://finance.yahoo.com/",
} as const;

export const COMEX_GOLD_SYMBOL = "GC=F";

/**
 * continueAfter = xlsx 历史最后一日（本机与香港一致）。适配器丢弃该日及之前的行情点，
 * 否则调度器的修订回看窗口会把 xlsx 历史（伦敦金现为 IDC 现货）覆盖成期货价。
 */
export const YAHOO_GOLD_SERIES = [
  {
    code: "usov_c05_comex_gold",
    symbol: COMEX_GOLD_SYMBOL,
    continueAfter: "2026-05-29",
    source: "COMEX（Yahoo 行情 GC=F）",
    note: "COMEX 黄金连续合约收盘价，行情接口 GC=F 日更",
  },
  {
    code: "goldov_c02_london_gold",
    symbol: COMEX_GOLD_SYMBOL,
    continueAfter: "2026-06-05",
    source: "IDC 伦敦金现（至 2026-06-05）；此后 COMEX 连续期货（Yahoo GC=F）",
    note: "口径变更：2026-06-05 后以 COMEX 连续期货收盘价续接（行情接口无伦敦现货），期现差不再有期现含义",
  },
] as const;

/** 日频、无官方发布日历 → probe_interval 24h（Agent B §3.2） */
export const YAHOO_GOLD_RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 24 };

export const YAHOO_GOLD_PACKAGE_ID = "us.yahoo.comex_gold";
