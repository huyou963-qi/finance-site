import type { DataGranularity } from "@prisma/client";
import { bisSeriesKeyFromDebtcapMeta } from "./bisProbe";
import { P0_DATA_SOURCE_FRED, P0_FRED_PILOT_SERIES, releaseRuleForPilot } from "./p0SeedCatalog";
import { USOV_FRED_SERIES_BY_CODE } from "./usovFredMap";

/** 频度中文 → Prisma 粒度 */
export function granularityFromFreqLabel(freq: string): DataGranularity {
  if (freq.includes("日")) return "DAILY";
  if (freq.includes("周")) return "WEEKLY";
  if (freq.includes("季")) return "QUARTERLY";
  if (freq.includes("年")) return "ANNUAL";
  return "MONTHLY";
}

const P0_FRED_IDS = new Set<string>(P0_FRED_PILOT_SERIES.map((x) => x.fredId));

/** FRED 美国目录中尚未在 P0 试点的序列 */
export const PHASE2_FRED_EXTRA = [
  { fredId: "GDP", name: "名义 GDP（季调）", freqLabel: "季", frequency: "季度" },
  { fredId: "A191RL1Q225SBEA", name: "实际 GDP 环比年化", freqLabel: "季", frequency: "季度" },
  { fredId: "CPILFESL", name: "核心 CPI", freqLabel: "月", frequency: "月" },
  { fredId: "PCEPI", name: "PCE 价格指数", freqLabel: "月", frequency: "月" },
  { fredId: "AHETPI", name: "私人部门平均时薪", freqLabel: "月", frequency: "月" },
  { fredId: "WALCL", name: "美联储总资产", freqLabel: "周", frequency: "周" },
  { fredId: "GS2", name: "2 年期美债收益率", freqLabel: "月", frequency: "月" },
  { fredId: "BAMLH0A0HYM2", name: "美国高收益债 OAS", freqLabel: "日", frequency: "日" },
  { fredId: "DTWEXBGS", name: "美元名义广义指数", freqLabel: "日", frequency: "日" },
  { fredId: "DEXUSEU", name: "美元/欧元汇率", freqLabel: "日", frequency: "日" },
  { fredId: "DEXJPUS", name: "日元/美元汇率", freqLabel: "日", frequency: "日" },
  { fredId: "PCEC96", name: "实际个人消费支出", freqLabel: "月", frequency: "月" },
  { fredId: "HOUST", name: "新屋开工", freqLabel: "月", frequency: "月" },
  { fredId: "CSUSHPINSA", name: "Case-Shiller 房价指数", freqLabel: "月", frequency: "月" },
  { fredId: "UMCSENT", name: "密歇根消费者信心", freqLabel: "月", frequency: "月" },
  { fredId: "CFNAI", name: "芝加哥联储全国活动指数", freqLabel: "月", frequency: "月" },
  { fredId: "USREC", name: "NBER 衰退指标", freqLabel: "月", frequency: "月" },
  { fredId: "VIXCLS", name: "VIX 波动率", freqLabel: "日", frequency: "日" },
].filter((x) => !P0_FRED_IDS.has(x.fredId));

/** usov_* 已有 FRED 映射（订阅挂到现有 Instrument） */
export const PHASE2_USOV_FRED = Object.entries(USOV_FRED_SERIES_BY_CODE).map(
  ([code, fredId]) => ({
    instrumentCode: code,
    fredId,
  }),
);

/** debtcap 预设键（去掉 4 条政府 leverage_nominal，BIS 无映射） */
export const PHASE2_DEBTCAP_BIS_CODES = [
  "debtcap_us_leverage_household",
  "debtcap_us_leverage_non_financial_corporate",
  "debtcap_us_debt_service_household",
  "debtcap_us_debt_service_private_non_financial",
  "debtcap_us_debt_service_non_financial_corporate",
  "debtcap_jp_leverage_household",
  "debtcap_jp_leverage_non_financial_corporate",
  "debtcap_jp_debt_service_household",
  "debtcap_jp_debt_service_private_non_financial",
  "debtcap_jp_debt_service_non_financial_corporate",
  "debtcap_cn_leverage_household",
  "debtcap_cn_leverage_non_financial_corporate",
  "debtcap_cn_debt_service_private_non_financial",
  "debtcap_de_leverage_household",
  "debtcap_de_leverage_non_financial_corporate",
  "debtcap_de_debt_service_household",
  "debtcap_de_debt_service_private_non_financial",
  "debtcap_de_debt_service_non_financial_corporate",
] as const;

export function bisSourceSeriesKeyForDebtcapCode(code: string): string | null {
  const mapped = bisSeriesKeyFromDebtcapMeta({ code });
  if (!mapped) return null;
  return `${mapped.flowId}:${mapped.seriesKey}`;
}

/** World Bank 试点：6 国 × 5 核心年频指标 */
export const PHASE2_WB_PILOT_COUNTRIES = ["CN", "JP", "DE", "GB", "FR", "IN"] as const;

export const PHASE2_WB_PILOT_INDICATORS = [
  { id: "NY.GDP.MKTP.KD.ZG", label: "GDP 增速" },
  { id: "FP.CPI.TOTL.ZG", label: "CPI 通胀" },
  { id: "SL.UEM.TOTL.ZS", label: "失业率" },
  { id: "GC.DOD.TOTL.GD.ZS", label: "政府债务占 GDP" },
  { id: "BX.KLT.DINV.WD.GD.ZS", label: "FDI 净流入占 GDP" },
] as const;

export function releaseRuleForPhase2(
  sourceKind: "fred" | "bis" | "worldbank",
  fredIdOrKey: string,
  granularity: DataGranularity,
) {
  if (sourceKind === "fred") {
    return releaseRuleForPilot(fredIdOrKey, granularity);
  }
  if (sourceKind === "bis") {
    return { type: "probe_interval" as const, intervalHours: 72 };
  }
  return { type: "probe_interval" as const, intervalHours: 168 };
}

export const PHASE2_DATA_SOURCES = {
  bis: {
    id: "bis",
    agencyId: "intl-bis",
    name: "BIS Statistics API",
    adapterKind: "REST_API" as const,
    baseUrl: "https://stats.bis.org/api/v1/data",
    termsUrl: "https://www.bis.org/statistics/about.htm",
    rateLimit: { requestsPerMinute: 30, minIntervalMs: 1200 },
  },
  worldbank: {
    id: "worldbank",
    agencyId: "intl-wb",
    name: "World Bank Open Data API",
    adapterKind: "WORLD_BANK_API" as const,
    baseUrl: "https://api.worldbank.org/v2",
    termsUrl: "https://data.worldbank.org/summary-terms-of-use",
    rateLimit: { requestsPerMinute: 60, minIntervalMs: 800 },
  },
} as const;

export const PHASE2_AGENCIES = [
  {
    id: "intl-bis",
    countryCode: "CH",
    nameZh: "国际清算银行",
    nameEn: "Bank for International Settlements",
    websiteUrl: "https://www.bis.org/statistics/",
  },
  {
    id: "intl-wb",
    countryCode: "US",
    nameZh: "世界银行开放数据",
    nameEn: "World Bank Open Data",
    websiteUrl: "https://data.worldbank.org/",
  },
] as const;
