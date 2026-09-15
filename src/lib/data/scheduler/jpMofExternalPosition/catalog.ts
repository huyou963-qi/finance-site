export const JP_MOF_EXTERNAL_POSITION_PROVIDER = "jp_mof_external_position";
export const JP_MOF_EXTERNAL_POSITION_SOURCE_ID = "jp-mof-external-position";
export const JP_MOF_EXTERNAL_POSITION_PACKAGE_ID = "jp.mof.external_position";
export const JP_MOF_EXTERNAL_POSITION_PAGE =
  "https://www.mof.go.jp/english/policy/international_policy/reference/iip/index.htm";
export const JP_MOF_IIP_XLS =
  "https://www.mof.go.jp/policy/international_policy/reference/iip/qiipm6.xls";
export const JP_MOF_EXTERNAL_DEBT_XLS =
  "https://www.mof.go.jp/policy/international_policy/reference/iip/edpm6.xls";
export const JP_MOF_EXTERNAL_POSITION_SCHEDULE =
  "https://www.mof.go.jp/english/policy/international_policy/reference/balance_of_payments/index.htm";
export const JP_MOF_EXTERNAL_POSITION_TERMS =
  "https://www.mof.go.jp/english/about_mof/notice/index.html";
export const JP_MOF_EXTERNAL_POSITION_HISTORY_START = "2015-03-01";
export const JP_MOF_EXTERNAL_POSITION_NEXT_RELEASE_AT = "2026-12-08T00:50:00.000Z";

export const JP_MOF_EXTERNAL_POSITION_SERIES = [
  {
    key: "assets",
    instrumentCode: "mof_jp_iip_total_assets_quarterly",
    label: "对外资产总额（季度估计）",
    nameEn: "International investment position, total assets (quarterly estimate)",
    workbook: "iip",
    sheet: "Assets",
    headerAnchor: "Total assets",
  },
  {
    key: "liabilities",
    instrumentCode: "mof_jp_iip_total_liabilities_quarterly",
    label: "对外负债总额（季度估计）",
    nameEn: "International investment position, total liabilities (quarterly estimate)",
    workbook: "iip",
    sheet: "Liabilities",
    headerAnchor: "Total liabilities",
  },
  {
    key: "net_iip",
    instrumentCode: "mof_jp_iip_net_quarterly",
    label: "净国际投资头寸（季度估计）",
    nameEn: "Net international investment position (quarterly estimate)",
    workbook: "iip",
    sheet: "Net",
    headerAnchor: "Net international",
  },
  {
    key: "external_debt",
    instrumentCode: "mof_jp_external_debt_total_quarterly",
    label: "对外债务总额（季度估计）",
    nameEn: "Gross external debt position (quarterly estimate)",
    workbook: "debt",
    sheet: "External Debt 対外債務",
    headerAnchor: "Debt Position",
  },
] as const;

export type JpMofExternalPositionSeries = (typeof JP_MOF_EXTERNAL_POSITION_SERIES)[number];
