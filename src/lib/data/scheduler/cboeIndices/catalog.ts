/** CBOE 指数抓取（VIX9D / VVIX）—— 仪器与数据源常量（seed / sync / verify / adapter 共用） */

export const CBOE_INDICES_PAGE_URL = "https://www.cboe.com/us/indices/dashboard/VIX9D/";
export const CBOE_INDICES_SYNC_SCRIPT = "scripts/data-worker/sync-cboe-vix9d-vvix.ts";

export type CboeIndexSeriesKey = "vix9d" | "vvix";

export type CboeIndexSeriesConfig = {
  seriesKey: CboeIndexSeriesKey;
  /** scrape.provider 分发用 */
  provider: "cboe_vix9d" | "cboe_vvix";
  csvUrl: string;
  /** CSV 中承载数值的列名 */
  valueColumn: string;
  instrumentCode: string;
  name: string;
  displayName: string;
  unit: string;
  freqLabel: "日";
  category: string;
  countryCode: "US";
  officialUrl: string;
  /** 值域校验（sanity check，宽松边界，只为拦截解析错误） */
  valueRange: readonly [number, number];
};

export const CBOE_INDEX_SERIES: readonly CboeIndexSeriesConfig[] = [
  {
    seriesKey: "vix9d",
    provider: "cboe_vix9d",
    csvUrl: "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX9D_History.csv",
    valueColumn: "CLOSE",
    instrumentCode: "cboe_vix9d",
    name: "CBOE 9日波动率指数（VIX9D）",
    displayName: "CBOE 9日波动率指数（VIX9D）",
    unit: "指数",
    freqLabel: "日",
    category: "市场情绪",
    countryCode: "US",
    officialUrl: "https://www.cboe.com/us/indices/dashboard/VIX9D/",
    valueRange: [1, 500],
  },
  {
    seriesKey: "vvix",
    provider: "cboe_vvix",
    csvUrl: "https://cdn.cboe.com/api/global/us_indices/daily_prices/VVIX_History.csv",
    valueColumn: "VVIX",
    instrumentCode: "cboe_vvix",
    name: "CBOE VIX波动率指数（VVIX，VIX的VIX）",
    displayName: "CBOE VIX波动率指数（VVIX）",
    unit: "指数",
    freqLabel: "日",
    category: "市场情绪",
    countryCode: "US",
    officialUrl: "https://www.cboe.com/us/indices/dashboard/VVIX/",
    valueRange: [1, 500],
  },
] as const;

export function cboeIndexSeriesByProvider(
  provider: string,
): CboeIndexSeriesConfig | undefined {
  return CBOE_INDEX_SERIES.find((s) => s.provider === provider);
}

export function cboeIndexSeriesByCode(
  instrumentCode: string,
): CboeIndexSeriesConfig | undefined {
  return CBOE_INDEX_SERIES.find((s) => s.instrumentCode === instrumentCode);
}

export const CBOE_SOURCE = {
  id: "cboe-indices",
  agencyId: "us-cboe",
  nameZh: "芝加哥期权交易所",
  nameEn: "Cboe Global Markets",
  name: "CBOE 波动率指数历史数据",
  baseUrl: CBOE_INDICES_PAGE_URL,
  termsUrl: "https://www.cboe.com/terms_and_conditions/",
  websiteUrl: "https://www.cboe.com/",
} as const;
