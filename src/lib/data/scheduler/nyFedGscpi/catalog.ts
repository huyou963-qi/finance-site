import { NYFED_GSCPI_XLS_URL, NYFED_GSCPI_PAGE_URL } from "./client";

/** NY Fed 全球供应链压力指数（GSCPI）抓取——仪器与数据源常量（seed / verify 共用）
 *
 * 目录归类：GSCPI 是供应链/通胀领先指标（压力上升通常领先商品/核心通胀几个月），
 * 归入「国民经济>景气综合」（与 CFNAI/WEI/UMCSENT 等领先综合指标同组）。
 * 仪器代码含 "gscpi"，usCatalogTaxonomy.ts 的 placementFromMdsCode 已加对应前缀规则，
 * 保证 mds 目录树最终落点与此一致。
 */
export const NYFED_GSCPI_SYNC_SCRIPT = "scripts/data-worker/sync-nyfed-gscpi.ts";

export const NYFED_GSCPI_INSTRUMENT = {
  code: "nyfed_gscpi",
  name: "全球供应链压力指数（GSCPI，纽约联储）",
  displayName: "全球供应链压力指数（GSCPI）",
  unit: "指数",
  freqLabel: "月",
  category: "国民经济",
  countryCode: "US" as const,
} as const;

export const NYFED_GSCPI_SOURCE = {
  id: "nyfed-gscpi",
  agencyId: "us-nyfed",
  nameZh: "纽约联储",
  nameEn: "Federal Reserve Bank of New York",
  name: "NY Fed 全球供应链压力指数",
  baseUrl: NYFED_GSCPI_PAGE_URL,
  termsUrl: "https://www.newyorkfed.org/disclaimer",
  websiteUrl: "https://www.newyorkfed.org/",
} as const;

export { NYFED_GSCPI_XLS_URL, NYFED_GSCPI_PAGE_URL };
