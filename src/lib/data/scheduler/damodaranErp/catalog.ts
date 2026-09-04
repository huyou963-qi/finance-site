import { DAMODARAN_ERP_XLS_URL, DAMODARAN_ERP_PAGE_URL } from "./client";

/** Damodaran 隐含股权风险溢价抓取——仪器与数据源常量（seed / verify 共用） */

export const DAMODARAN_ERP_SYNC_SCRIPT =
  "scripts/data-worker/sync-damodaran-erp.ts";

export const DAMODARAN_ERP_INSTRUMENT = {
  code: "damodaran_us_erp_implied",
  name: "美国隐含股权风险溢价（Damodaran，FCFE 两阶段模型，年度）",
  displayName: "隐含股权风险溢价（ERP）",
  unit: "%",
  freqLabel: "年",
  category: "利率与信用市场",
  countryCode: "US" as const,
} as const;

export const DAMODARAN_SOURCE = {
  id: "damodaran",
  agencyId: "us-damodaran",
  nameZh: "达摩达兰（NYU Stern）",
  nameEn: "Aswath Damodaran, NYU Stern School of Business",
  name: "Damodaran 隐含股权风险溢价",
  baseUrl: DAMODARAN_ERP_PAGE_URL,
  termsUrl: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/webcastnotes/usagerules.htm",
  websiteUrl: "https://pages.stern.nyu.edu/~adamodar/",
} as const;

export { DAMODARAN_ERP_XLS_URL, DAMODARAN_ERP_PAGE_URL };
