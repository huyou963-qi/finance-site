import { ZILLOW_RESEARCH_DATA_URL, ZILLOW_ZORI_CSV_URL } from "./client";

/**
 * Zillow 观测租金指数（ZORI，全美）——仪器与数据源常量（seed / verify 共用）。
 *
 * 用途：新签租约的市场租金，领先 CPI 主要住所租金 / 业主等价租金约 9–12 个月
 * （CPI 租金按 6 个月一轮的存量租约采价，天然滞后）。
 *
 * 目录：仪器代码以 `zillow_` 开头，usCatalogTaxonomy.placementFromMdsCode 归
 * 「地产与建筑 > 房价与可负担性」（与 Case-Shiller 同组：同属市场成交价格口径）。
 * 发布包 `us.zillow.zori`（probe_interval 72 小时）：Zillow 每月中旬整表重发、无固定日历。
 */
export const ZILLOW_ZORI_SYNC_SCRIPT = "scripts/data-worker/sync-zillow-zori.ts";
export const ZILLOW_ZORI_PACKAGE_ID = "us.zillow.zori";

export const ZILLOW_ZORI_INSTRUMENT = {
  code: "zillow_us_zori_sa",
  name: "Zillow 观测租金指数（ZORI，全美，平滑季调）",
  nameEn: "Zillow Observed Rent Index (ZORI), United States, All Homes Plus Multifamily, Smoothed, SA",
  displayName: "Zillow 观测租金指数（ZORI，全美）",
  unit: "美元/月",
  freqLabel: "月",
  category: "地产与建筑",
  countryCode: "US" as const,
  expectedStart: "2015-01-01",
} as const;

export const ZILLOW_ZORI_SOURCE = {
  id: "zillow-research",
  agencyId: "us-zillow",
  nameZh: "Zillow Research",
  nameEn: "Zillow Economic Research",
  name: "Zillow Research 住房数据",
  baseUrl: ZILLOW_RESEARCH_DATA_URL,
  termsUrl: ZILLOW_RESEARCH_DATA_URL,
  websiteUrl: "https://www.zillow.com/research/",
  attribution: "数据来源：Zillow Research（Zillow Observed Rent Index）",
} as const;

export { ZILLOW_ZORI_CSV_URL, ZILLOW_RESEARCH_DATA_URL };
