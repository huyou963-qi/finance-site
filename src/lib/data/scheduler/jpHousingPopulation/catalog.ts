/**
 * Japan housing and population core indicators.
 *
 * The scope deliberately keeps national aggregates only.  All e-Stat rows are
 * a single published cell: no prefectural series or client-side aggregation is
 * used.  MLIT's property-price workbook is the official national SA composite.
 */
export const JP_HOUSING_POPULATION_SOURCE_ID = "estat-jp";
export const JP_HOUSING_POPULATION_PACKAGE_ID = "jp.housing_population";
export const JP_HOUSING_POPULATION_ESTAT_URL =
  "https://www.e-stat.go.jp/api/en/api-info/api-guide";
export const JP_MLIT_PROPERTY_PRICE_URL =
  "https://www.mlit.go.jp/totikensangyo/totikensangyo_tk5_000085.html";

type EStatCoreSeries = {
  instrumentCode: string;
  label: string;
  unit: string;
  freqLabel: "月" | "年";
  eStat: {
    statsDataId: string;
    filters: Record<string, string>;
    frequency: "M" | "A";
    expectedUnit: string;
    historyStart: string;
  };
  subcategory: string;
  source: string;
  officialUrl: string;
  note: string;
};

const housingStarts = (key: string, label: string, tab: "18" | "13", use: "11" | "12" | "13" | "15", unit: string): EStatCoreSeries => ({
  instrumentCode: `jp_mlit_housing_starts_${key}_nsa`,
  label: `新设住宅开工：${label}（全国、未季调）`,
  unit,
  freqLabel: "月",
  subcategory: "住宅开工",
  source: "日本国土交通省 / e-Stat",
  officialUrl: "https://www.mlit.go.jp/statistics/details/jutaku_tk_000002.html",
  note: "国土交通省建筑着工统计调查表10；全国、新设、结构计。直接保存官方户数或总楼地板面积，未季调、不年率化。官方表会回溯修订，完整回读历史。",
  eStat: {
    statsDataId: "0003114514",
    filters: { cdTab: tab, cdCat01: "11", cdCat02: use, cdCat03: "12" },
    frequency: "M",
    expectedUnit: tab === "18" ? "戸・件" : "m2",
    historyStart: "2011-01-01",
  },
});

export const JP_HOUSING_POPULATION_ESTAT_SERIES: readonly EStatCoreSeries[] = [
  housingStarts("total", "总户数", "18", "11", "户"),
  housingStarts("floor_area", "总楼地板面积", "13", "11", "平方米"),
  housingStarts("owner_occupied", "持家", "18", "12", "户"),
  housingStarts("rental", "租赁住宅", "18", "13", "户"),
  housingStarts("for_sale", "分譲住宅", "18", "15", "户"),
  {
    instrumentCode: "jp_sbj_population_total_provisional",
    label: "总人口（全国、月初概算）",
    unit: "万人",
    freqLabel: "月",
    subcategory: "人口估计",
    source: "日本总务省统计局 / e-Stat",
    officialUrl: "https://www.stat.go.jp/english/data/jinsui/",
    note: "总务省统计局人口推计的全国月初概算值，2020年国势调查基准；不与旧基准拼接。完整回读以捕获修订。",
    eStat: { statsDataId: "0003443838", filters: { cdTab: "001", cdCat01: "001", cdCat02: "000", cdCat03: "01000", cdCat04: "01", cdArea: "00000" }, frequency: "M", expectedUnit: "万人", historyStart: "2021-12-01" },
  },
  {
    instrumentCode: "jp_sbj_population_age15_64_provisional",
    label: "15–64岁人口（全国、月初概算）",
    unit: "万人",
    freqLabel: "月",
    subcategory: "人口估计",
    source: "日本总务省统计局 / e-Stat",
    officialUrl: "https://www.stat.go.jp/english/data/jinsui/",
    note: "总务省统计局直接发布的15–64岁再揭人口（非本站加总），2020年国势调查基准；不与旧基准拼接。",
    eStat: { statsDataId: "0003443838", filters: { cdTab: "001", cdCat01: "001", cdCat02: "000", cdCat03: "01023", cdCat04: "01", cdArea: "00000" }, frequency: "M", expectedUnit: "万人", historyStart: "2021-12-01" },
  },
  {
    instrumentCode: "jp_sbj_population_age65_plus_share_provisional",
    label: "65岁及以上人口占比（全国、月初概算）",
    unit: "%",
    freqLabel: "月",
    subcategory: "人口估计",
    source: "日本总务省统计局 / e-Stat",
    officialUrl: "https://www.stat.go.jp/english/data/jinsui/",
    note: "总务省统计局直接发布的65岁及以上人口比例，2020年国势调查基准；不由本站以人口分项计算。",
    eStat: { statsDataId: "0003443839", filters: { cdTab: "003", cdCat01: "001", cdCat02: "000", cdCat03: "003", cdCat04: "01", cdArea: "00000" }, frequency: "M", expectedUnit: "％", historyStart: "2021-12-01" },
  },
  {
    instrumentCode: "jp_mhlw_vital_births_annual",
    label: "出生数（全国、确报）",
    unit: "人",
    freqLabel: "年",
    subcategory: "人口动态",
    source: "日本厚生劳动省 / e-Stat",
    officialUrl: "https://www.mhlw.go.jp/english/database/db-hh/",
    note: "厚生劳动省人口动态统计确报，全国年度出生数；保留官方年度频率，不将月报初值与年度确报拼接。",
    eStat: { statsDataId: "0003411561", filters: { cdCat01: "00110" }, frequency: "A", expectedUnit: "人", historyStart: "1947-01-01" },
  },
  {
    instrumentCode: "jp_mhlw_vital_deaths_annual",
    label: "死亡数（全国、确报）",
    unit: "人",
    freqLabel: "年",
    subcategory: "人口动态",
    source: "日本厚生劳动省 / e-Stat",
    officialUrl: "https://www.mhlw.go.jp/english/database/db-hh/",
    note: "厚生劳动省人口动态统计确报，全国年度死亡数；保留官方年度频率，不将月报初值与年度确报拼接。",
    eStat: { statsDataId: "0003411561", filters: { cdCat01: "00150" }, frequency: "A", expectedUnit: "人", historyStart: "1947-01-01" },
  },
] as const;

export const JP_MLIT_PROPERTY_PRICE_SERIES = {
  instrumentCode: "jp_mlit_residential_property_price_index_sa",
  label: "住宅不动产价格指数：全国综合（季调）",
  unit: "指数（2010=100）",
  freqLabel: "月" as const,
  source: "日本国土交通省",
  officialUrl: JP_MLIT_PROPERTY_PRICE_URL,
  subcategory: "住宅价格",
  historyStart: "2008-04-01",
  note: "国土交通省不动产价格指数（住宅）全国住宅综合的季调指数。只保存全国综合，避免地区、城市圈和都道府县细分。每次下载最新官方工作簿并全历史回读；源方会修订历史并曾更正季调环比，本站不以环比代替指数。",
} as const;

export const JP_HOUSING_POPULATION_SERIES_COUNT =
  JP_HOUSING_POPULATION_ESTAT_SERIES.length + 1;

export function buildJpHousingPopulationMetadata(series: EStatCoreSeries) {
  return {
    countryCode: "JP", countryNameZh: "日本", catalogKey: `mds:${series.instrumentCode}`,
    catalogCategory: series.subcategory === "住宅开工" || series.subcategory === "住宅价格" ? "固定资产与地产" : "人口与就业",
    catalogSubcategory: series.subcategory, displayName: series.label,
    sourceTag: "jp-housing-population", source: series.source, officialUrl: series.officialUrl, sourceUrl: series.officialUrl,
    unit: series.unit, freqLabel: series.freqLabel, geography: "日本全国", eStat: series.eStat,
    sourceUpdateNote: series.note,
    fetchAcquisition: { status: "known", method: "estat_api", methodLabel: "e-Stat 官方 API（固定全国维度）", fetchUrl: "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData", officialUrl: series.officialUrl },
    attribution: "Source: Government of Japan statistics via e-Stat. Chinese labels translated by finance-site.",
  };
}

export function buildJpMlitPropertyPriceMetadata() {
  const series = JP_MLIT_PROPERTY_PRICE_SERIES;
  return {
    countryCode: "JP", countryNameZh: "日本", catalogKey: `mds:${series.instrumentCode}`,
    catalogCategory: "固定资产与地产", catalogSubcategory: series.subcategory, displayName: series.label,
    sourceTag: "jp-mlit-property-price", source: series.source, officialUrl: series.officialUrl, sourceUrl: series.officialUrl,
    unit: series.unit, freqLabel: series.freqLabel, geography: "日本全国", seasonalAdjustment: "SA", basePeriod: "2010=100",
    scrape: { provider: "jp_mlit_property_price" },
    sourceUpdateNote: series.note,
    fetchAcquisition: { status: "known", method: "official_xlsx", methodLabel: "国土交通省最新官方 Excel 工作簿", fetchUrl: series.officialUrl, officialUrl: series.officialUrl },
    attribution: "Source: Ministry of Land, Infrastructure, Transport and Tourism, Japan, Residential Property Price Index.",
  };
}
