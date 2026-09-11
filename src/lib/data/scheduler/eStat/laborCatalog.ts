/** Official API metadata verified 2026-09-10; do not extend before 2018 without rebasing audit. */
export const JP_ESTAT_LABOR_SOURCE_ID = "estat-jp";
export const JP_ESTAT_LABOR_PACKAGE_ID = "jp.stat.labor_force";
export const JP_ESTAT_LABOR_URL = "https://www.stat.go.jp/english/data/roudou/index.html";
export const JP_ESTAT_LABOR_HISTORY_START = "2018-01-01";
const concepts = [
  { key: "employed", label: "就业人数", statsDataId: "0003005798", tab: "01", status: "02", unit: "万人", expectedUnit: "万人" },
  { key: "unemployed", label: "失业人数", statsDataId: "0003005798", tab: "01", status: "08", unit: "万人", expectedUnit: "万人" },
  { key: "participation_rate", label: "劳动参与率", statsDataId: "0003005865", tab: "02", status: "01", unit: "%", expectedUnit: "％" },
  { key: "employment_rate", label: "就业率", statsDataId: "0003005865", tab: "02", status: "13", unit: "%", expectedUnit: "％" },
] as const;
const sexes = [{ key: "total", code: "0", label: "总计" }, { key: "male", code: "1", label: "男性" }, { key: "female", code: "2", label: "女性" }] as const;
export const JP_ESTAT_LABOR_SERIES = concepts.flatMap(c => sexes.map(s => ({
  instrumentCode: `jp_estat_lfs_${c.key}_${s.key}_nsa`,
  label: `${c.label}：${s.label}（15岁及以上，未季调）`,
  concept: c.key, sex: s.key, unit: c.unit,
  eStat: { statsDataId: c.statsDataId, filters: { cdTab: c.tab, cdCat01: "000", cdCat02: c.status, cdCat03: s.code, cdArea: "00000" }, frequency: "M" as const, expectedUnit: c.expectedUnit, historyStart: JP_ESTAT_LABOR_HISTORY_START },
})));
export function buildJpEStatLaborMetadata(s: typeof JP_ESTAT_LABOR_SERIES[number]) {
  return {
    countryCode: "JP", countryNameZh: "日本", catalogKey: `mds:${s.instrumentCode}`,
    catalogCategory: "人口与就业", catalogSubcategory: "劳动力调查", displayName: s.label,
    sourceTag: "jp-estat-labor", bootstrapOnly: false, source: "日本总务省统计局 / e-Stat", officialUrl: JP_ESTAT_LABOR_URL,
    sourceUrl: JP_ESTAT_LABOR_URL, unit: s.unit, freqLabel: "月", seasonalAdjustment: "NSA", ageScope: "15岁及以上", geography: "日本全国", sex: s.sex,
    eStat: s.eStat,
    sourceUpdateNote: "官方月度基本集计原数值，2018-01起；2018–2021已按最新人口基准回溯调整，更早基本集计与可比时间序列表口径不一致，故不拼接。每次回扫2018年以来历史以捕获修订。就业率=就业人口/15岁及以上人口，劳动参与率=劳动力/15岁及以上人口；直接取官方率，本站不推算。版本账本仅证明抓取时点可见，不代表历史首发PIT。",
    fetchAcquisition: { status: "known", method: "estat_api", methodLabel: "e-Stat 官方 API（固定全部维度）", fetchUrl: "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData", officialUrl: JP_ESTAT_LABOR_URL },
    attribution: "Source: Statistics Bureau of Japan, Labour Force Survey Basic Tabulation, via e-Stat. Chinese labels translated by finance-site.",
  };
}

