export const JP_MOF_SECURITIES_PROVIDER = "jp_mof_securities_transactions";
export const JP_MOF_SECURITIES_SOURCE_ID = "jp-mof-securities-transactions";
export const JP_MOF_SECURITIES_PACKAGE_ID = "jp.mof.international_transactions_securities";
export const JP_MOF_SECURITIES_PAGE =
  "https://www.mof.go.jp/english/policy/international_policy/reference/itn_transactions_in_securities/index.htm";
export const JP_MOF_SECURITIES_CSV =
  "https://www.mof.go.jp/policy/international_policy/reference/itn_transactions_in_securities/montha1.csv";
export const JP_MOF_SECURITIES_SCHEDULE =
  "https://www.mof.go.jp/english/policy/international_policy/reference/itn_transactions_in_securities/schedule.htm";
export const JP_MOF_SECURITIES_TERMS =
  "https://www.mof.go.jp/english/about_mof/notice/index.html";
export const JP_MOF_SECURITIES_HISTORY_START = "2005-01-01";
export const JP_MOF_SECURITIES_NEXT_RELEASE_AT = "2026-10-07T23:50:00.000Z";

export const JP_MOF_SECURITIES_SERIES = [
  {
    key: "resident_foreign_equity",
    instrumentCode: "mof_jp_securities_resident_foreign_equity_net",
    label: "居民买卖海外股票及投资基金份额净额",
    nameEn: "Residents' transactions in foreign equity and investment fund shares, net",
    columns: [5] as readonly number[],
  },
  {
    key: "resident_foreign_debt",
    instrumentCode: "mof_jp_securities_resident_foreign_debt_net",
    label: "居民买卖海外债券净额",
    nameEn: "Residents' transactions in foreign debt securities, net",
    columns: [8, 12] as readonly number[],
  },
  {
    key: "nonresident_japan_equity",
    instrumentCode: "mof_jp_securities_nonresident_japan_equity_net",
    label: "非居民买卖日本股票及投资基金份额净额",
    nameEn: "Non-residents' transactions in Japanese equity and investment fund shares, net",
    columns: [16] as readonly number[],
  },
  {
    key: "nonresident_japan_debt",
    instrumentCode: "mof_jp_securities_nonresident_japan_debt_net",
    label: "非居民买卖日本债券净额",
    nameEn: "Non-residents' transactions in Japanese debt securities, net",
    columns: [19, 23] as readonly number[],
  },
] as const;

export type JpMofSecuritiesSeries = (typeof JP_MOF_SECURITIES_SERIES)[number];
