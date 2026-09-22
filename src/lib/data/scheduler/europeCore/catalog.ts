import type { DataGranularity } from "@prisma/client";

export const EUROSTAT_SOURCE_ID = "eurostat";
export const ECB_SOURCE_ID = "ecb-data";
export const EUROSTAT_API_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
export const ECB_API_BASE = "https://data-api.ecb.europa.eu/service/data";

export type EuropeCoreArea = {
  key: string;
  sourceGeo: string;
  countryCode: string;
  nameZh: string;
};

export const EUROPE_CORE_AREAS: readonly EuropeCoreArea[] = [
  { key: "eu27", sourceGeo: "EU27_2020", countryCode: "EU", nameZh: "欧盟27国" },
  { key: "ea21", sourceGeo: "EA21", countryCode: "EA", nameZh: "欧元区21国" },
  { key: "de", sourceGeo: "DE", countryCode: "DE", nameZh: "德国" },
  { key: "fr", sourceGeo: "FR", countryCode: "FR", nameZh: "法国" },
  { key: "it", sourceGeo: "IT", countryCode: "IT", nameZh: "意大利" },
  { key: "es", sourceGeo: "ES", countryCode: "ES", nameZh: "西班牙" },
  { key: "nl", sourceGeo: "NL", countryCode: "NL", nameZh: "荷兰" },
  { key: "pl", sourceGeo: "PL", countryCode: "PL", nameZh: "波兰" },
] as const;

type EurostatMetric = {
  key: string;
  dataset: string;
  labelZh: string;
  freqLabel: "月" | "季度";
  granularity: DataGranularity;
  unit: string;
  category: string;
  subgroup: string;
  packageId: string;
  filters: Record<string, string>;
  minObservations: number;
  maxLagDays: number;
  note: string;
};

export const EUROSTAT_CORE_METRICS: readonly EurostatMetric[] = [
  {
    key: "gdp_real_index_sa",
    dataset: "namq_10_gdp",
    labelZh: "实际GDP季调指数",
    freqLabel: "季度",
    granularity: "QUARTERLY",
    unit: "指数（2020=100，链式量）",
    category: "国民经济",
    subgroup: "GDP：实际总量",
    packageId: "eu.eurostat.gdp",
    filters: { freq: "Q", unit: "CLV_I20", s_adj: "SCA", na_item: "B1GQ" },
    minObservations: 80,
    maxLagDays: 240,
    note: "ESA 2010；季调和日历调整后的链式量指数。环比、同比由模板指标运算计算。",
  },
  {
    key: "hicp_all_items",
    dataset: "prc_hicp_minr",
    labelZh: "HICP总项指数",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "指数（2025=100）",
    category: "通胀与价格",
    subgroup: "HICP",
    packageId: "eu.eurostat.hicp",
    filters: { freq: "M", unit: "I25", coicop18: "TOTAL" },
    minObservations: 200,
    maxLagDays: 120,
    note: "ECOICOP ver.2 统一消费价格指数总项水平；同比、环比不单独入库，由模板指标运算计算。",
  },
  {
    key: "unemployment_rate_sa",
    dataset: "une_rt_m",
    labelZh: "失业率（季调）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "%",
    category: "劳动力市场",
    subgroup: "失业率",
    packageId: "eu.eurostat.unemployment",
    filters: { freq: "M", s_adj: "SA", age: "TOTAL", unit: "PC_ACT", sex: "T" },
    minObservations: 120,
    maxLagDays: 120,
    note: "ILO/欧盟劳动力调查协调口径，15—74岁总人口劳动力失业率，季调。",
  },
  {
    key: "industrial_production_sa",
    dataset: "sts_inpr_m",
    labelZh: "工业生产指数（季调）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "指数（2021=100）",
    category: "国民经济",
    subgroup: "工业生产",
    packageId: "eu.eurostat.industrial_production",
    filters: { freq: "M", indic_bt: "PRD", nace_r2: "B-D", s_adj: "SCA", unit: "I21" },
    minObservations: 120,
    maxLagDays: 150,
    note: "NACE Rev.2 B-D（采矿、制造、电力气体等）总量，季调和日历调整。",
  },
  {
    key: "retail_volume_sa",
    dataset: "sts_trtu_m",
    labelZh: "零售销售量指数（季调）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "指数（2021=100）",
    category: "国民经济",
    subgroup: "零售销售",
    packageId: "eu.eurostat.retail_trade",
    filters: { freq: "M", indic_bt: "VOL_SLS", nace_r2: "G47_X_G473", s_adj: "SCA", unit: "I21" },
    minObservations: 120,
    maxLagDays: 150,
    note: "除汽车燃料外零售业销售量，季调和日历调整；同比、环比在展示层计算。",
  },
  {
    key: "government_debt",
    dataset: "gov_10q_ggdebt",
    labelZh: "政府总债务",
    freqLabel: "季度",
    granularity: "QUARTERLY",
    unit: "百万欧元",
    category: "财政与公共债务",
    subgroup: "政府债务",
    packageId: "eu.eurostat.government_debt",
    filters: { freq: "Q", na_item: "GD", sector: "S13", unit: "MIO_EUR" },
    minObservations: 40,
    maxLagDays: 300,
    note: "ESA 2010 一般政府合并口径、期末名义总债务。债务/GDP 比率不入库，按需在模板运算。",
  },
] as const;

export type EuropeCoreSeries = {
  instrumentCode: string;
  displayName: string;
  countryCode: string;
  countryNameZh: string;
  sourceGeo: string;
  sourceId: string;
  sourceSeriesKey: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  subgroup: string;
  packageId: string;
  minObservations: number;
  maxLagDays: number;
  note: string;
  provider: "eurostat" | "ecb";
  dataset?: string;
  filters?: Record<string, string>;
  flow?: string;
  seriesKey?: string;
};

export const RETIRED_EUROPE_CORE_CODES = ["eurostat_ea20_hicp_all_items"] as const;

export const EUROSTAT_CORE_SERIES: readonly EuropeCoreSeries[] = EUROPE_CORE_AREAS.flatMap(
  (area) => EUROSTAT_CORE_METRICS.map((metric) => ({
      instrumentCode: `eurostat_${area.key}_${metric.key}`,
      displayName: `${area.nameZh}：${metric.labelZh}`,
      countryCode: area.countryCode,
      countryNameZh: area.nameZh,
      sourceGeo: area.sourceGeo,
      sourceId: EUROSTAT_SOURCE_ID,
      sourceSeriesKey: `${metric.dataset}:${area.sourceGeo}`,
      freqLabel: metric.freqLabel,
      granularity: metric.granularity,
      unit: metric.unit,
      category: metric.category,
      subgroup: metric.subgroup,
      packageId: metric.packageId,
      minObservations: metric.minObservations,
      maxLagDays: metric.maxLagDays,
      note: metric.note,
      provider: "eurostat" as const,
      dataset: metric.dataset,
      filters: { ...metric.filters, geo: area.sourceGeo },
    })),
);

export const ECB_CORE_SERIES: readonly EuropeCoreSeries[] = [
  {
    instrumentCode: "ecb_ea_deposit_facility_rate",
    displayName: "欧元区：ECB存款便利利率",
    countryCode: "EA",
    countryNameZh: "欧元区",
    sourceGeo: "U2",
    sourceId: ECB_SOURCE_ID,
    sourceSeriesKey: "FM:D.U2.EUR.4F.KR.DFR.LEV",
    freqLabel: "日",
    granularity: "DAILY",
    unit: "%",
    category: "利率与信用市场",
    subgroup: "ECB政策利率",
    packageId: "eu.ecb.key_rates",
    minObservations: 5_000,
    maxLagDays: 30,
    note: "ECB 存款便利利率日度水平；仅存官方水平，不另存变动值。",
    provider: "ecb",
    flow: "FM",
    seriesKey: "D.U2.EUR.4F.KR.DFR.LEV",
  },
  {
    instrumentCode: "ecb_ea_m3_stock",
    displayName: "欧元区：M3货币存量",
    countryCode: "EA",
    countryNameZh: "欧元区",
    sourceGeo: "U2",
    sourceId: ECB_SOURCE_ID,
    sourceSeriesKey: "BSI:M.U2.N.V.M30.X.1.U2.2300.Z01.E",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "百万欧元",
    category: "货币政策与流动性",
    subgroup: "货币存量",
    packageId: "eu.ecb.monetary_aggregates",
    minObservations: 300,
    maxLagDays: 120,
    note: "ECB 欧元区变动构成口径 M3 期末存量，未季调；增速由模板指标运算计算。",
    provider: "ecb",
    flow: "BSI",
    seriesKey: "M.U2.N.V.M30.X.1.U2.2300.Z01.E",
  },
] as const;

export const EUROPE_CORE_SERIES: readonly EuropeCoreSeries[] = [
  ...EUROSTAT_CORE_SERIES,
  ...ECB_CORE_SERIES,
];

export function findEuropeCoreSeries(instrumentCode: string): EuropeCoreSeries | undefined {
  return EUROPE_CORE_SERIES.find((series) => series.instrumentCode === instrumentCode);
}
