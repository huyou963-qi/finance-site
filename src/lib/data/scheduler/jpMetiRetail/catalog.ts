export const JP_METI_RETAIL_PROVIDER = "jp_meti_retail";
export const JP_METI_RETAIL_SOURCE_ID = "jp-meti-retail";
export const JP_METI_RETAIL_PACKAGE_ID = "jp.meti.current_survey_commerce";
export const JP_METI_RETAIL_PAGE =
  "https://www.meti.go.jp/statistics/tyo/syoudou/result-2/";
export const JP_METI_RETAIL_URL =
  "https://www.meti.go.jp/statistics/tyo/syoudou/result-2/excel/h2slt11j.xlsx";
export const JP_METI_RETAIL_ESTAT_LIST =
  "https://www.e-stat.go.jp/stat-search/files?cycle=0&layout=datalist&page=1&tclass1=000001081879&tclass2val=0&toukei=00550030&toukei_kind=6&tstat=000001081875";
export const JP_METI_RETAIL_TITLE = "業種別商業販売額及び前年（度、同期、同月）比";
export const JP_METI_RETAIL_STAT_INF_ID_AT_ONBOARDING = "000031387992";

const rows = [
  ["retail_total", "小売業計", "零售销售总额", "1980-01-01"],
  ["general_merchandise", "各種商品小売業", "综合商品零售销售额", "1980-01-01"],
  ["apparel", "織物・衣服・身の回り品小売業", "纺织服装及个人用品零售销售额", "1980-01-01"],
  ["food_beverages", "飲食料品小売業", "食品饮料零售销售额", "1980-01-01"],
  ["motor_vehicles", "自動車小売業", "汽车零售销售额", "1980-01-01"],
  ["machinery_equipment", "機械器具小売業", "机械器具零售销售额", "1980-01-01"],
  ["fuel", "燃料小売業", "燃料零售销售额", "1997-07-01"],
  ["medicine_toiletries", "医薬品・化粧品小売業", "医药品及化妆品零售销售额", "2010-07-01"],
  ["other", "その他小売業", "其他零售销售额", "2010-07-01"],
  ["nonstore", "無店舗小売業", "无店铺零售销售额", "2015-07-01"],
] as const;

const CORE_KEYS = new Set(["retail_total", "food_beverages", "motor_vehicles", "fuel", "nonstore"]);

export const JP_METI_RETAIL_SERIES = rows.filter(([key]) => CORE_KEYS.has(key)).map(([key, sourceName, label, historyStart]) => ({
  instrumentCode: `meti_jp_retail_${key}_value_nsa`,
  key,
  sourceName,
  label,
  historyStart,
}));

export type JpMetiRetailSeries = (typeof JP_METI_RETAIL_SERIES)[number];

export function jpMetiRetailEStatDownloadUrl(statInfId: string) {
  if (!/^\d{12}$/.test(statInfId)) throw new Error(`invalid e-Stat statInfId: ${statInfId}`);
  return `https://www.e-stat.go.jp/stat-search/file-download?statInfId=${statInfId}&fileKind=0`;
}
