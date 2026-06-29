/** Treasury Fiscal Data API 序列规格 */
export type TreasuryRowSelector =
  | "mts1_fy_month"
  | "classification_desc"
  | "account_type"
  | "mts9_sum"
  | "dts_tga_net"
  | "debt_penny_weekly";

/** MTS Table 9 功能分类支出（record_type_cd=F）求和口径 */
export const MTS9_MANDATORY_PROXY_CLASSES = [
  "Social Security",
  "Medicare",
  "Health",
  "Income Security",
  "Veterans Benefits and Services",
] as const;

export const MTS9_DISCRETIONARY_PROXY_CLASSES = [
  "National Defense",
  "Education, Training, Employment, and Social Services",
  "Transportation",
  "International Affairs",
  "Energy",
  "Natural Resources and Environment",
  "General Science, Space, and Technology",
  "Commerce and Housing Credit",
  "Community and Regional Development",
  "Administration of Justice",
  "General Government",
  "Agriculture",
] as const;

export type TreasurySourceSpec = {
  endpoint: string;
  valueField: string;
  rowSelector: TreasuryRowSelector;
  apiFilters?: string;
  classificationDesc?: string;
  recordTypeCd?: string;
  accountType?: string;
  sumClassificationDesc?: readonly string[];
  /** 日频大表增量拉取起点（首跑无 lastObs 时） */
  fetchStartFloor?: string;
};

/** 短键 → 完整 spec（sourceSeriesKey 限 128 字符） */
export const TREASURY_SOURCE_SPEC_BY_KEY: Record<string, TreasurySourceSpec> = {
  "mts1:receipts": {
    endpoint: "v1/accounting/mts/mts_table_1",
    rowSelector: "mts1_fy_month",
    apiFilters: "record_type_cd:eq:MTH,data_type_cd:eq:D",
    valueField: "current_month_gross_rcpt_amt",
  },
  "mts1:outlays": {
    endpoint: "v1/accounting/mts/mts_table_1",
    rowSelector: "mts1_fy_month",
    apiFilters: "record_type_cd:eq:MTH,data_type_cd:eq:D",
    valueField: "current_month_gross_outly_amt",
  },
  "mts1:deficit": {
    endpoint: "v1/accounting/mts/mts_table_1",
    rowSelector: "mts1_fy_month",
    apiFilters: "record_type_cd:eq:MTH,data_type_cd:eq:D",
    valueField: "current_month_dfct_sur_amt",
  },
  "mts9:individual_income": {
    endpoint: "v1/accounting/mts/mts_table_9",
    rowSelector: "classification_desc",
    valueField: "current_month_rcpt_outly_amt",
    classificationDesc: "Individual Income Taxes",
    recordTypeCd: "RSG",
  },
  "mts9:corporate_income": {
    endpoint: "v1/accounting/mts/mts_table_9",
    rowSelector: "classification_desc",
    valueField: "current_month_rcpt_outly_amt",
    classificationDesc: "Corporation Income Taxes",
    recordTypeCd: "RSG",
  },
  "mts9:payroll": {
    endpoint: "v1/accounting/mts/mts_table_9",
    rowSelector: "classification_desc",
    valueField: "current_month_rcpt_outly_amt",
    classificationDesc: "Employment and General Retirement",
    recordTypeCd: "RSG",
  },
  "mts9:net_interest": {
    endpoint: "v1/accounting/mts/mts_table_9",
    rowSelector: "classification_desc",
    valueField: "current_month_rcpt_outly_amt",
    classificationDesc: "Net Interest",
    recordTypeCd: "F",
  },
  "dts:tga_close": {
    endpoint: "v1/accounting/dts/operating_cash_balance",
    rowSelector: "account_type",
    valueField: "open_today_bal",
    accountType: "Treasury General Account (TGA) Closing Balance",
  },
  "dts:daily_net_cash": {
    endpoint: "v1/accounting/dts/operating_cash_balance",
    rowSelector: "dts_tga_net",
    valueField: "open_today_bal",
    fetchStartFloor: "2018-01-01",
  },
  "debt:penny_net_weekly": {
    endpoint: "v2/accounting/od/debt_to_penny",
    rowSelector: "debt_penny_weekly",
    valueField: "tot_pub_debt_out_amt",
    fetchStartFloor: "2010-01-01",
  },
  "mts9:mandatory_proxy": {
    endpoint: "v1/accounting/mts/mts_table_9",
    rowSelector: "mts9_sum",
    valueField: "current_month_rcpt_outly_amt",
    recordTypeCd: "F",
    sumClassificationDesc: MTS9_MANDATORY_PROXY_CLASSES,
  },
  "mts9:discretionary_proxy": {
    endpoint: "v1/accounting/mts/mts_table_9",
    rowSelector: "mts9_sum",
    valueField: "current_month_rcpt_outly_amt",
    recordTypeCd: "F",
    sumClassificationDesc: MTS9_DISCRETIONARY_PROXY_CLASSES,
  },
};

export function parseTreasurySourceSpec(sourceSeriesKey: string): TreasurySourceSpec {
  const spec = TREASURY_SOURCE_SPEC_BY_KEY[sourceSeriesKey.trim()];
  if (!spec) {
    throw new Error(`未知 Treasury sourceSeriesKey：${sourceSeriesKey}`);
  }
  return spec;
}

export function treasurySourceSpecKey(shortKey: string): string {
  if (!TREASURY_SOURCE_SPEC_BY_KEY[shortKey]) {
    throw new Error(`未注册 Treasury 短键：${shortKey}`);
  }
  return shortKey;
}
