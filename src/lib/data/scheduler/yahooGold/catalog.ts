/**
 * 行情接口（Yahoo v8 chart，/markets 行情页同源）。
 *
 * 黄金：COMEX 期货与现货已改为标准仪器 comex_gold_futures（GC=F 全量）/ wgc_gold_price_usd，
 * 见 goldPrices/catalog.ts；旧 xlsx 列 usov_c05 / goldov_c01 / goldov_c02 已被取代（保留历史、目录隐藏）。
 *
 * 旧 Excel 行情列已彻底删除。标准 COMEX 黄金期货由 goldPrices/catalog.ts 管理。
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
export const YAHOO_GOLD_PACKAGE_ID = "us.yahoo.comex_gold";
export const YAHOO_GOLD_SERIES: readonly {
  code: string; symbol: string; continueAfter: string; source: string; note: string;
  valueRange: readonly [number, number]; packageId: string;
}[] = [];

/** 日频、无官方发布日历 → probe_interval 24h（Agent B §3.2） */
export const YAHOO_GOLD_RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 24 };
