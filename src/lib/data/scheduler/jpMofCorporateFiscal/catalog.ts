export const JP_MOF_CORPORATE_FISCAL_PROVIDER = "jp_mof_corporate_fiscal";

export const JP_MOF_CORPORATE_SOURCE_ID = "jp-mof-corporate-quarterly";
export const JP_MOF_FISCAL_SOURCE_ID = "jp-mof-fiscal-statistics";
export const JP_MOF_DEBT_SOURCE_ID = "jp-mof-central-government-debt";

export const JP_MOF_CORPORATE_PACKAGE_ID = "jp.mof.corporate_statistics";
export const JP_MOF_FISCAL_PACKAGE_ID = "jp.mof.fiscal_statistics";
export const JP_MOF_DEBT_PACKAGE_ID = "jp.mof.central_government_debt";

export const JP_MOF_CORPORATE_TABLE = "0003060191";
export const JP_MOF_CORPORATE_PAGE =
  "https://www.mof.go.jp/pri/reference/ssc/results/data.htm";
export const JP_MOF_CORPORATE_ESTAT_PAGE =
  "https://www.e-stat.go.jp/dbview?sid=0003060191";
export const JP_MOF_CORPORATE_SCHEDULE =
  "https://www.mof.go.jp/pri/reference/ssc/results/release_info.htm";
export const JP_MOF_CORPORATE_NEXT_RELEASE_AT = "2026-11-30T23:50:00.000Z";

export const JP_MOF_FISCAL_PAGE =
  "https://www.mof.go.jp/policy/budget/reference/statistics/data.htm";
export const JP_MOF_FISCAL_RESULTS_URL =
  "https://www.mof.go.jp/policy/budget/reference/statistics/07.xlsx";
export const JP_MOF_FISCAL_DEBT_SERVICE_URL =
  "https://www.mof.go.jp/policy/budget/reference/statistics/20.xlsx";

export const JP_MOF_DEBT_PAGE =
  "https://www.mof.go.jp/jgbs/reference/gbb/index.htm";
export const JP_MOF_DEBT_WORKBOOK_URL =
  "https://www.mof.go.jp/english/policy/jgbs/reference/gbb/suii.xls";
export const JP_MOF_DEBT_NEXT_RELEASE_AT = "2026-11-10T05:00:00.000Z";

export const JP_MOF_TERMS_URL = "https://www.mof.go.jp/english/about_mof/notice/index.html";
export const ESTAT_TERMS_URL = "https://www.e-stat.go.jp/api/en/terms-of-use";

const corporateRows = [
  ["sales", "法人企业销售额", "078", "百万円"],
  ["ordinary_profit", "法人企业经常利润", "086", "百万円"],
  ["capital_expenditure", "法人企业设备投资（含软件）", "040", "百万円"],
  ["inventories", "法人企业棚卸资产", "164", "百万円"],
  ["total_assets", "法人企业总资产", "013", "百万円"],
  ["total_liabilities", "法人企业负债", "171", "百万円"],
  ["equity_ratio", "法人企业权益比率", "143", "％"],
] as const;

export const JP_MOF_CORPORATE_SERIES = corporateRows.map(([key, label, itemCode, sourceUnit]) => ({
  instrumentCode: `mof_jp_corporate_${key}`,
  key,
  label,
  itemCode,
  sourceUnit,
  unit: sourceUnit === "％" ? "%" : "百万日元",
  dataset: "corporate" as const,
  sourceId: JP_MOF_CORPORATE_SOURCE_ID,
  packageId: JP_MOF_CORPORATE_PACKAGE_ID,
  granularity: "QUARTERLY" as const,
}));

const fiscalRows = [
  ["general_account_revenue_actual", "中央政府一般会计收入（决算）", "revenue"],
  ["general_account_expenditure_actual", "中央政府一般会计支出（决算）", "expenditure"],
  ["general_account_surplus_actual", "中央政府一般会计财政法第41条剰余金", "surplus"],
  ["general_account_debt_service_actual", "中央政府一般会计国债费（决算，含付息与偿还）", "debt_service"],
] as const;

export const JP_MOF_FISCAL_SERIES = fiscalRows.map(([key, label, field]) => ({
  instrumentCode: `mof_jp_fiscal_${key}`,
  key,
  label,
  field,
  unit: "百万日元",
  dataset: "fiscal" as const,
  sourceId: JP_MOF_FISCAL_SOURCE_ID,
  packageId: JP_MOF_FISCAL_PACKAGE_ID,
  granularity: "ANNUAL" as const,
}));

export const JP_MOF_DEBT_SERIES = [{
  instrumentCode: "mof_jp_general_bonds_outstanding",
  key: "general_bonds_outstanding",
  label: "普通国债余额",
  unit: "亿日元",
  dataset: "debt" as const,
  sourceId: JP_MOF_DEBT_SOURCE_ID,
  packageId: JP_MOF_DEBT_PACKAGE_ID,
  granularity: "QUARTERLY" as const,
}] as const;

export const JP_MOF_CORPORATE_FISCAL_SERIES = [
  ...JP_MOF_CORPORATE_SERIES,
  ...JP_MOF_FISCAL_SERIES,
  ...JP_MOF_DEBT_SERIES,
];

export type JpMofCorporateFiscalSeries = (typeof JP_MOF_CORPORATE_FISCAL_SERIES)[number];

export function jpMofCorporateFiscalSeriesByCode(code: string) {
  return JP_MOF_CORPORATE_FISCAL_SERIES.find((series) => series.instrumentCode === code);
}
