/**
 * 世界黄金协会（WGC）金价接口：LBMA 黄金价格（美元/盎司，日频）。
 *
 * 标准仪器定义见 goldPrices/catalog.ts（wgc_gold_price_usd）。
 *
 * 接口：fsapi.gold.org v11，无需 Cookie（Cookie 只有 Goldhub ETF 持仓下载才要）；
 * **单次窗口超过约一年会被静默降采样**（每次最多约 250 点），客户端按 ≤300 天分段请求。
 * 日频数据从 1970-01-01 开始（实测 1967、1968 年窗口均返回空）。
 */
export const WGC_GOLD_PRICE_SOURCE = {
  id: "wgc-goldprice",
  agencyId: "intl-wgc",
  name: "World Gold Council gold price API（LBMA 金价，美元/盎司）",
  baseUrl: "https://fsapi.gold.org/api/goldprice/v11/chart/price/usd/oz",
  termsUrl: "https://www.gold.org/terms-and-conditions",
  pageUrl: "https://www.gold.org/goldhub/data/gold-prices",
} as const;

/** 接口在此之前无日频数据；全量回填时不必从调度器默认的 1950 年逐段空请求 */
export const WGC_GOLD_PRICE_EARLIEST = "1970-01-01";

/** 日频、无官方发布日历 → probe_interval 24h */
export const WGC_GOLD_PRICE_RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 24 };

export const WGC_GOLD_PRICE_PACKAGE_ID = "intl.wgc.gold_price";
