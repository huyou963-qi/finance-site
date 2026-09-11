/** Verified against e-Stat getStatsList/getMetaInfo/getStatsData on 2026-09-10.
 * Table values are nominal monthly average yen per household. The Japanese label
 * `実収入` means cash income received; it is not an inflation-adjusted measure.
 */
export const JP_ESTAT_HOUSEHOLD_SOURCE_ID = "estat-jp";
export const JP_ESTAT_HOUSEHOLD_PACKAGE_ID = "jp.sbj.household_survey";
export const JP_ESTAT_HOUSEHOLD_TABLE = "0002070001";
export const JP_ESTAT_HOUSEHOLD_URL = "https://www.stat.go.jp/data/kakei/index.html";
export const JP_ESTAT_HOUSEHOLD_HISTORY_START = "2000-01-01";

const rows = [
  { key: "consumption_all", label: "消费支出：二人以上家庭", item: "059", household: "03", fixtureName: "all-consumption" },
  { key: "consumption_worker", label: "消费支出：二人以上勤劳者家庭", item: "059", household: "04", fixtureName: "worker-consumption" },
  { key: "income_worker", label: "实收入：二人以上勤劳者家庭", item: "019", household: "04", fixtureName: "worker-income" },
  { key: "disposable_income_worker", label: "可支配收入：二人以上勤劳者家庭", item: "233", household: "04", fixtureName: "worker-disposable-income" },
] as const;

export const JP_ESTAT_HOUSEHOLD_SERIES = rows.map((row) => ({
  instrumentCode: `jp_estat_household_${row.key}_nominal_nsa`,
  label: `${row.label}（名义、每户月均、未季调）`,
  concept: row.key,
  unit: "日元/户/月",
  fixtureName: row.fixtureName,
  eStat: {
    statsDataId: JP_ESTAT_HOUSEHOLD_TABLE,
    filters: { cdTab: "01", cdCat01: row.item, cdCat02: row.household, cdArea: "00000" },
    frequency: "M" as const,
    expectedUnit: "円",
    historyStart: JP_ESTAT_HOUSEHOLD_HISTORY_START,
  },
}));

export function buildJpEStatHouseholdMetadata(series: typeof JP_ESTAT_HOUSEHOLD_SERIES[number]) {
  return {
    countryCode: "JP",
    countryNameZh: "日本",
    catalogKey: `mds:${series.instrumentCode}`,
    catalogCategory: "国民经济",
    catalogSubcategory: "家庭消费与收入",
    displayName: series.label,
    sourceTag: "jp-estat-household",
    bootstrapOnly: false,
    source: "日本总务省统计局 / e-Stat",
    officialUrl: JP_ESTAT_HOUSEHOLD_URL,
    sourceUrl: JP_ESTAT_HOUSEHOLD_URL,
    unit: series.unit,
    freqLabel: "月",
    seasonalAdjustment: "NSA",
    priceBasis: "nominal",
    householdScope: series.eStat.filters.cdCat02 === "03" ? "二人以上家庭" : "二人以上家庭中的勤劳者家庭",
    geography: "日本全国",
    measureBasis: "每户每月平均金额",
    eStat: series.eStat,
    sourceUpdateNote: "家计调查家计收支编的官方月度每户平均金额，直接读取e-Stat表0002070001。现行二人以上家庭分类从2000-01开始，完整回扫以捕获修订。全部为名义、未季调金额；日文“实收入”指家庭实际收到的现金收入，不是剔除物价后的实际收入。该API表不含实质消费同比或季调消费指数，本站不从CPI自行推算。版本账本仅证明抓取时点可见，不代表历史首发PIT。",
    fetchAcquisition: {
      status: "known",
      method: "estat_api",
      methodLabel: "e-Stat 官方 API（固定全部维度）",
      fetchUrl: "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData",
      officialUrl: JP_ESTAT_HOUSEHOLD_URL,
    },
    attribution: "Source: Statistics Bureau of Japan, Family Income and Expenditure Survey, via e-Stat. Chinese labels translated by finance-site.",
  };
}
