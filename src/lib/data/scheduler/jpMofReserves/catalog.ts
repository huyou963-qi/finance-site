export const JP_MOF_RESERVES_PROVIDER = "jp_mof_reserves";
export const JP_MOF_RESERVES_SOURCE_ID = "jp-mof-reserves";
export const JP_MOF_RESERVES_PACKAGE_ID = "jp.mof.international_reserves";
export const JP_MOF_RESERVES_PAGE =
  "https://www.mof.go.jp/english/policy/international_policy/reference/official_reserve_assets/index.htm";
export const JP_MOF_RESERVES_CSV =
  "https://www.mof.go.jp/policy/international_policy/reference/official_reserve_assets/historical.csv";
export const JP_MOF_RESERVES_SCHEDULE =
  "https://www.mof.go.jp/english/policy/international_policy/reference/official_reserve_assets/news.htm";
export const JP_MOF_TERMS = "https://www.mof.go.jp/english/about_mof/notice/index.html";

const rows = [
  ["total", "外汇储备资产总额", "Official reserve assets", 4, "百万美元", "2000-04-01"],
  ["foreign_currency", "外币储备", "Foreign currency reserves", 5, "百万美元", "2000-04-01"],
  ["securities", "外币储备：证券", "Securities", 6, "百万美元", "2000-04-01"],
  ["deposits", "外币储备：存款", "Deposits", 8, "百万美元", "2000-04-01"],
  ["imf_position", "IMF储备头寸", "IMF reserve position", 14, "百万美元", "2000-04-01"],
  ["sdr", "特别提款权", "SDRs", 15, "百万美元", "2000-04-01"],
  ["gold_value", "黄金储备价值", "Gold", 16, "百万美元", "2000-04-01"],
  ["gold_volume", "黄金储备数量", "Gold volume", 17, "百万金衡盎司", "2000-04-01"],
  ["other_reserve_assets", "其他储备资产", "Other reserve assets", 18, "百万美元", "2006-03-01"],
  ["other_foreign_currency_assets", "其他外币资产", "Other foreign currency assets", 22, "百万美元", "2008-09-01"],
] as const;

export const JP_MOF_RESERVES_SERIES = rows.map(
  ([key, label, sourceName, column, unit, historyStart]) => ({
    instrumentCode: `mof_jp_reserves_${key}`,
    key,
    label,
    sourceName,
    column,
    unit,
    historyStart,
  }),
);

export type JpMofReservesSeries = (typeof JP_MOF_RESERVES_SERIES)[number];
