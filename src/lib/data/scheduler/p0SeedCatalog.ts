import type { DataGranularity } from "@prisma/client";
import { PROBE_ONLY_FRED_SERIES } from "./investingEventMap";
import {
  defaultEconomicCalendarRule,
  defaultReleaseRuleForGranularity,
} from "./releaseRule";

/** @deprecated 使用 investingEventMap.PROBE_ONLY_FRED_SERIES */
export { PROBE_ONLY_FRED_SERIES as P0_PROBE_ONLY_FRED } from "./investingEventMap";

/** P0 试点：美国 FRED 序列（官方数据经圣路易斯联储 FRED 聚合） */
export const P0_FRED_PILOT_SERIES = [
  {
    fredId: "CPIAUCSL",
    code: "sched_fred_CPIAUCSL",
    name: "美国 CPI（全部城市消费者）",
    freqLabel: "月",
    granularity: "MONTHLY" as DataGranularity,
    unit: "指数",
  },
  {
    fredId: "UNRATE",
    code: "sched_fred_UNRATE",
    name: "美国失业率",
    freqLabel: "月",
    granularity: "MONTHLY" as DataGranularity,
    unit: "%",
  },
  {
    fredId: "GDPC1",
    code: "sched_fred_GDPC1",
    name: "美国实际 GDP（季调）",
    freqLabel: "季",
    granularity: "QUARTERLY" as DataGranularity,
    unit: "十亿美元",
  },
  {
    fredId: "FEDFUNDS",
    code: "sched_fred_FEDFUNDS",
    name: "联邦基金有效利率",
    freqLabel: "月",
    granularity: "MONTHLY" as DataGranularity,
    unit: "%",
  },
  {
    fredId: "INDPRO",
    code: "sched_fred_INDPRO",
    name: "工业生产指数",
    freqLabel: "月",
    granularity: "MONTHLY" as DataGranularity,
    unit: "指数",
  },
  {
    fredId: "PAYEMS",
    code: "sched_fred_PAYEMS",
    name: "非农就业人数",
    freqLabel: "月",
    granularity: "MONTHLY" as DataGranularity,
    unit: "千人",
  },
  {
    fredId: "T10Y2Y",
    code: "sched_fred_T10Y2Y",
    name: "10Y-2Y 国债利差",
    freqLabel: "日",
    granularity: "DAILY" as DataGranularity,
    unit: "%",
  },
  {
    fredId: "GS10",
    code: "sched_fred_GS10",
    name: "10 年期美债收益率",
    freqLabel: "月",
    granularity: "MONTHLY" as DataGranularity,
    unit: "%",
  },
  {
    fredId: "M2SL",
    code: "sched_fred_M2SL",
    name: "M2 货币供应量",
    freqLabel: "月",
    granularity: "MONTHLY" as DataGranularity,
    unit: "十亿美元",
  },
  {
    fredId: "RSAFS",
    code: "sched_fred_RSAFS",
    name: "零售销售总额",
    freqLabel: "月",
    granularity: "MONTHLY" as DataGranularity,
    unit: "百万美元",
  },
] as const;

/** P0 试点：月/季宏观走经济日历；日频或无日历映射走固定间隔探测 */
export function releaseRuleForPilot(fredId: string, granularity: DataGranularity) {
  if (granularity === "DAILY" || PROBE_ONLY_FRED_SERIES.has(fredId)) {
    return defaultReleaseRuleForGranularity(granularity);
  }
  return defaultEconomicCalendarRule(granularity);
}

export function releaseRuleFallbackForPilot(granularity: DataGranularity) {
  return defaultReleaseRuleForGranularity(granularity);
}

/** 多国统计机构种子（P0 仅 FRED 订阅会跑；其余供目录扩展） */
export const P0_STATISTICAL_AGENCIES = [
  {
    id: "us-fred",
    countryCode: "US",
    nameZh: "美联储经济数据库（FRED）",
    nameEn: "FRED / Federal Reserve Bank of St. Louis",
    websiteUrl: "https://fred.stlouisfed.org/",
    metadata: { note: "聚合美国 BLS、BEA、Fed 等官方序列" },
  },
  {
    id: "us-bls",
    countryCode: "US",
    nameZh: "美国劳工统计局",
    nameEn: "Bureau of Labor Statistics",
    websiteUrl: "https://www.bls.gov/",
  },
  {
    id: "cn-nbs",
    countryCode: "CN",
    nameZh: "国家统计局",
    nameEn: "National Bureau of Statistics of China",
    websiteUrl: "https://www.stats.gov.cn/",
  },
  {
    id: "jp-soumu",
    countryCode: "JP",
    nameZh: "总务省（统计局）",
    nameEn: "Statistics Bureau of Japan (MIC)",
    websiteUrl: "https://www.stat.go.jp/",
  },
  {
    id: "de-destatis",
    countryCode: "DE",
    nameZh: "德国联邦统计局",
    nameEn: "Destatis",
    websiteUrl: "https://www.destatis.de/",
  },
] as const;

export const P0_DATA_SOURCE_FRED = {
  id: "fred",
  agencyId: "us-fred",
  name: "FRED API",
  adapterKind: "FRED_API" as const,
  baseUrl: "https://api.stlouisfed.org/fred",
  termsUrl: "https://fred.stlouisfed.org/docs/api/terms_of_use.html",
  rateLimit: { requestsPerMinute: 120, minIntervalMs: 500 },
};
