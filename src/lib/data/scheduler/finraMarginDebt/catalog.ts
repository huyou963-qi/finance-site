import type { DataGranularity } from "@prisma/client";

/**
 * FINRA 客户融资余额统计（Margin Statistics）——数据源。
 *
 * FINRA Rule 4521(d) 要求会员行按月申报客户保证金账户余额，FINRA 汇总后仅在这一张
 * 官网页面发布，明确写明"不提供数据接口，数据不通过其他渠道分发"，故只能走月度
 * Excel 全量下载（非增量 API）。搜过 "NYSE margin debt" 等关键词，FRED 零命中。
 * robots.txt 未 Disallow 相关路径（2026-09 核实），公开、无需登录。
 *
 * 三条序列同一张表：Debit Balances（融资余额，即"股市杠杆率"最常引用的口径）
 * 从 1997-01 起有值；两条 Free Credit Balances 里，Cash Accounts 同样从 1997-01
 * 起有值，但 Securities Margin Accounts 这一列官方 2010-02 起才开始统计（2010 年
 * FINRA Rule 4521 生效前无此分项），2010-02 之前该月份行只有 3 列而非 4 列——
 * 解析时必须按"该列是否存在"逐列独立判断，不能假设每行列数一致。
 */
export const FINRA_MARGIN_STATISTICS_PAGE_URL =
  "https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics";
export const FINRA_MARGIN_STATISTICS_XLS_URL =
  "https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx";
export const FINRA_MARGIN_STATISTICS_SYNC_SCRIPT =
  "scripts/data-worker/sync-finra-margin-debt.ts";

export const FINRA_MARGIN_STATISTICS_SOURCE = {
  id: "finra-margin-statistics",
  agencyId: "us-finra",
  nameZh: "美国金融业监管局（FINRA）",
  nameEn: "Financial Industry Regulatory Authority",
  name: "FINRA 客户融资余额统计",
  baseUrl: FINRA_MARGIN_STATISTICS_PAGE_URL,
  termsUrl: "https://www.finra.org/about/terms-use",
  websiteUrl: "https://www.finra.org/",
} as const;

export type FinraMarginSeriesKey =
  | "debit_balances"
  | "free_credit_cash"
  | "free_credit_margin";

export type FinraMarginSeriesConfig = {
  seriesKey: FinraMarginSeriesKey;
  /** scrape.provider 分发用 */
  provider: string;
  instrumentCode: string;
  /** 源表表头文本，用于按列名而非固定列序定位（源改列顺序时仍能命中） */
  columnHeader: string;
  name: string;
  displayName: string;
  freqLabel: "月";
  granularity: DataGranularity;
  unit: string;
  category: string;
  countryCode: "US";
  officialUrl: string;
  sourceUpdateNote: string;
  /** 值域校验（宽松边界，单位百万美元，只为拦截解析错位/单位错乱） */
  valueRange: readonly [number, number];
};

export const FINRA_MARGIN_STATISTICS_SERIES: readonly FinraMarginSeriesConfig[] = [
  {
    seriesKey: "debit_balances",
    provider: "finra_margin_debit_balances",
    instrumentCode: "finra_us_margin_debit_balances",
    columnHeader: "Debit Balances in Customers' Securities Margin Accounts",
    name: "FINRA Debit Balances in Customers' Securities Margin Accounts",
    displayName: "美国股市融资余额（Margin Debt）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "百万美元",
    category: "利率与信用市场",
    countryCode: "US",
    officialUrl: FINRA_MARGIN_STATISTICS_PAGE_URL,
    sourceUpdateNote: "FINRA Rule 4521(d) 月度汇总，通常次月第三周更新，历史全量 Excel 覆盖 1997-01 起",
    valueRange: [0, 5_000_000],
  },
  {
    seriesKey: "free_credit_cash",
    provider: "finra_margin_free_credit_cash",
    instrumentCode: "finra_us_margin_free_credit_cash",
    columnHeader: "Free Credit Balances in Customers' Cash Accounts",
    name: "FINRA Free Credit Balances in Customers' Cash Accounts",
    displayName: "美国股市现金账户闲置资金余额",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "百万美元",
    category: "利率与信用市场",
    countryCode: "US",
    officialUrl: FINRA_MARGIN_STATISTICS_PAGE_URL,
    sourceUpdateNote: "FINRA Rule 4521(d) 月度汇总，历史全量 Excel 覆盖 1997-01 起",
    valueRange: [0, 5_000_000],
  },
  {
    seriesKey: "free_credit_margin",
    provider: "finra_margin_free_credit_margin",
    instrumentCode: "finra_us_margin_free_credit_margin",
    columnHeader: "Free Credit Balances in Customers' Securities Margin Accounts",
    name: "FINRA Free Credit Balances in Customers' Securities Margin Accounts",
    displayName: "美国股市保证金账户闲置资金余额",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "百万美元",
    category: "利率与信用市场",
    countryCode: "US",
    officialUrl: FINRA_MARGIN_STATISTICS_PAGE_URL,
    // 2010-02 起该分项才开始统计（FINRA Rule 4521 取代此前 NYSE/NASD 各自口径），早于此无值。
    sourceUpdateNote: "FINRA Rule 4521(d) 月度汇总，仅 2010-02 起有该分项（规则生效前未单独统计）",
    valueRange: [0, 5_000_000],
  },
] as const;

export function finraMarginSeriesByProvider(
  provider: string,
): FinraMarginSeriesConfig | null {
  return FINRA_MARGIN_STATISTICS_SERIES.find((s) => s.provider === provider) ?? null;
}
