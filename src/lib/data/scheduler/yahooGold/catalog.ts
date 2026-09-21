/**
 * 行情接口（Yahoo v8 chart，/markets 行情页同源）。
 *
 * 黄金：COMEX 期货与现货已改为标准仪器 comex_gold_futures（GC=F 全量）/ wgc_gold_price_usd，
 * 见 goldPrices/catalog.ts；旧 xlsx 列 usov_c05 / goldov_c01 / goldov_c02 已被取代（保留历史、目录隐藏）。
 *
 * 此处 YAHOO_GOLD_SERIES 只剩 xlsx 历史 + 行情续接的旧列：
 * - goldov_c27_brent「期货结算价(连续):布伦特原油」（黄金分析模板的油价序列）：原无订阅、停在
 *   2026-06-05。xlsx 历史与 Yahoo BZ=F **逐日精确相等**（2024-01 起重叠 605 天，605 天全部相等、
 *   最大差 0.015%），而与 EIA 布伦特现货 DCOILBRENTEU 平均差 2.07%、最大 22%——口径就是
 *   BZ=F，续接无断层（2026-09-21）。
 *
 * 只做增量续接（从库内最后观测往后），不覆盖 xlsx 历史。
 * 包 us.yahoo.comex_gold 还包含 comex_gold_futures（全量 GC=F，无 continueAfter）。
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
export const BRENT_FUTURES_SYMBOL = "BZ=F";

/**
 * continueAfter = xlsx 历史最后一日（本机与香港一致）。适配器丢弃该日及之前的行情点，
 * 否则调度器的修订回看窗口会把 xlsx 历史覆盖成行情接口的值。
 */
export const YAHOO_GOLD_SERIES = [
  {
    code: "goldov_c27_brent",
    symbol: BRENT_FUTURES_SYMBOL,
    continueAfter: "2026-06-05",
    source: "ICE 布伦特原油连续期货（Yahoo 行情 BZ=F）",
    note: "布伦特原油连续期货收盘价，行情接口 BZ=F 日更；xlsx 历史与 BZ=F 逐日精确一致",
    /** 自检的最新值合理区间（美元/桶） */
    valueRange: [10, 500],
  },
] as const;

/** 日频、无官方发布日历 → probe_interval 24h（Agent B §3.2） */
export const YAHOO_GOLD_RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 24 };

export const YAHOO_GOLD_PACKAGE_ID = "us.yahoo.comex_gold";
