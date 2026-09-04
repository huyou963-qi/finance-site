import { SHILLER_CAPE_PAGE_URL } from "./client";

/** Shiller CAPE 抓取——仪器与数据源常量（seed / verify 共用）
 *
 * 目录归类：US 分类树（usCatalogTaxonomy.ts）当前无「估值/valuation」专属分类，
 * CAPE（周期调整市盈率）是股票市场估值/情绪类指标，取「利率与信用市场」大类下
 * 既有子类「市场情绪」作为落点（与该子类下其他市场情绪型指标同组，不新建分类）。
 */
export const SHILLER_CAPE_SYNC_SCRIPT = "scripts/data-worker/sync-shiller-cape.ts";

export const SHILLER_CAPE_INSTRUMENT = {
  code: "us_shiller_cape",
  name: "Shiller CAPE（周期调整市盈率，P/E10）",
  displayName: "Shiller CAPE（P/E10）",
  unit: "x",
  freqLabel: "月",
  category: "利率与信用市场",
  countryCode: "US" as const,
} as const;

export const SHILLER_CAPE_SOURCE = {
  id: "multpl",
  agencyId: "us-multpl",
  nameZh: "multpl.com（Shiller CAPE 数据镜像）",
  nameEn: "multpl.com",
  name: "multpl.com Shiller CAPE",
  baseUrl: SHILLER_CAPE_PAGE_URL,
  termsUrl: "https://www.multpl.com/",
  websiteUrl: "https://www.multpl.com/",
} as const;

export { SHILLER_CAPE_PAGE_URL };
