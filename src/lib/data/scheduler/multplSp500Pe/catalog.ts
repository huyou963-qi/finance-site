import { US_SP500_PE_CODE } from "../../usOverviewStandardSeries";

/**
 * 标普500 市盈率（multpl.com 抓取）——仪器常量（seed / sync / verify 共用）
 *
 * 替代已退役的 US_Overview xlsx 列 `usov_c28_sp500_pe`（来源标注 Wind，无订阅、停在 2026-05）。
 * 口径：S&P 500 价格 / 过去 12 个月报告（GAAP）每股收益，月度；表内最新月份带 `†` 估算标记，
 * 随财报披露修订（upsert 覆盖）。1871-01 起全历史，与 Shiller CAPE 同站同表结构，复用其客户端、
 * 解析器与 `multpl` 数据源。
 * 目录：利率与信用市场 › 市场情绪（usCatalogTaxonomy.ts 显式规则）。
 */
export const MULTPL_SP500_PE_PAGE_URL = "https://www.multpl.com/s-p-500-pe-ratio/table/by-month";

export const MULTPL_SP500_PE_SYNC_SCRIPT = "scripts/data-worker/sync-multpl-sp500-pe.ts";

export const MULTPL_SP500_PE_INSTRUMENT = {
  code: US_SP500_PE_CODE,
  name: "标普500市盈率（TTM，multpl.com）",
  displayName: "标普500市盈率（TTM）",
  unit: "倍",
  freqLabel: "月",
  category: "利率与信用市场",
  countryCode: "US" as const,
} as const;

/** 月频、无官方发布日历 → probe_interval（Agent B §3.2：月频 72h） */
export const MULTPL_SP500_PE_RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 72 };

export const MULTPL_VALUATION_PACKAGE_ID = "us.multpl.valuation";
