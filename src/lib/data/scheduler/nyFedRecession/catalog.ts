import { NYFED_RECESSION_XLS_URL, NYFED_RECESSION_PAGE_URL } from "./client";

/** NY Fed 衰退概率抓取——仪器与数据源常量（seed / verify 共用） */

export const NYFED_RECESSION_SYNC_SCRIPT =
  "scripts/data-worker/sync-nyfed-recession.ts";

export const NYFED_RECESSION_INSTRUMENT = {
  code: "nyfed_us_recession_prob",
  name: "NY Fed 衰退概率（收益率曲线模型，12 个月前瞻）",
  displayName: "NY Fed 衰退概率（12 个月前瞻）",
  unit: "%",
  freqLabel: "月",
  category: "领先与深度",
  countryCode: "US" as const,
} as const;

export const NYFED_SOURCE = {
  id: "nyfed",
  agencyId: "us-nyfed",
  nameZh: "纽约联储",
  nameEn: "Federal Reserve Bank of New York",
  name: "NY Fed 收益率曲线衰退概率",
  baseUrl: NYFED_RECESSION_PAGE_URL,
  termsUrl: "https://www.newyorkfed.org/disclaimer",
  websiteUrl: "https://www.newyorkfed.org/",
} as const;

export {
  NYFED_RECESSION_XLS_URL,
  NYFED_RECESSION_PAGE_URL,
};
