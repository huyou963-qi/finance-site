import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import {
  defaultEconomicCalendarRule,
  defaultReleaseRuleForGranularity,
  type ReleaseRule,
} from "./releaseRule";

/**
 * 周度市场定价与真实经济确认层需要补齐的 FRED 序列。
 *
 * 这些序列全部复用既有 FRED adapter、canonical observation writer 与 scheduler；
 * 不引入平行数据源。频率、单位和 Release 已于 2026-08-25 逐条按 FRED 页面核实。
 */
export type MarketPricingFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  source: string;
  sourceUpdateNote: string;
  releasePackageId: string;
};

function row(
  fredId: string,
  displayName: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
  category: string,
  source: string,
  sourceUpdateNote: string,
  releasePackageId: string,
): MarketPricingFredSeedRow {
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name: displayName,
    displayName,
    freqLabel,
    granularity,
    unit,
    category,
    source,
    sourceUpdateNote,
    releasePackageId,
  };
}

export const MARKET_PRICING_FRED_SERIES: readonly MarketPricingFredSeedRow[] = [
  row(
    "T5YIFR",
    "5Y5Y 远期通胀预期",
    "日",
    "DAILY",
    "%",
    "通胀驱动因子",
    "FRED",
    "交易日",
    "us.frb.interest_rate_spreads",
  ),
  row(
    "VXVCLS",
    "CBOE S&P 500 3个月波动率指数",
    "日",
    "DAILY",
    "指数",
    "证券市场",
    "CBOE/FRED",
    "交易日收盘",
    "us.cboe.market_statistics",
  ),
  row(
    "ANFCI",
    "Chicago Fed 调整后全国金融条件指数",
    "周",
    "WEEKLY",
    "指数",
    "金融条件",
    "Chicago Fed/FRED",
    "每周三（观测截至前周五）",
    "us.chicagofed.nfci",
  ),
  row(
    "WEI",
    "周度经济指数（Lewis-Mertens-Stock）",
    "周",
    "WEEKLY",
    "指数",
    "景气调查",
    "Lewis-Mertens-Stock/FRED",
    "每周四（观测截至前周六）",
    "us.fred.weekly_economic_index",
  ),
] as const;

export const MARKET_PRICING_FRED_IDS = new Set(
  MARKET_PRICING_FRED_SERIES.map((item) => item.fredId),
);

export function buildMarketPricingInstrumentMetadata(
  item: MarketPricingFredSeedRow,
  opts?: {
    existing?: Record<string, unknown> | null;
    dataLastObsDateIso?: string | null;
  },
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(opts?.existing ?? {}),
    sourceTag: "market-pricing-fred-seed",
    source: item.source,
    sourceUpdateNote: item.sourceUpdateNote,
    countryCode: "US",
    countryNameZh: "美国",
    displayName: item.displayName,
    catalogCategory: usMetadataCatalogCategory({
      code: item.code,
      fredId: item.fredId,
      label: item.displayName,
      legacyCategory: item.category,
    }),
    freqLabel: item.freqLabel,
    unit: item.unit,
    catalogKey: `fred:${item.fredId}`,
  };
  if (opts?.dataLastObsDateIso) metadata.dataLastObsDateIso = opts.dataLastObsDateIso;
  return metadata;
}

export function releaseRuleForMarketPricing(
  granularity: DataGranularity,
): ReleaseRule {
  return defaultReleaseRuleForGranularity(granularity);
}

export type MarketPricingRepairRow = {
  fredId: string;
  code: string;
  granularity: DataGranularity;
  releasePackageId: string;
  releaseRule: () => ReleaseRule;
};

/**
 * 已有序列只修订阅调度和发布包归属，不重复 seed Instrument/事实表。
 */
export const MARKET_PRICING_REPAIR_SERIES: readonly MarketPricingRepairRow[] = [
  {
    fredId: "T5YIE",
    code: "sched_fred_T5YIE",
    granularity: "DAILY",
    releasePackageId: "us.frb.interest_rate_spreads",
    releaseRule: () => defaultReleaseRuleForGranularity("DAILY"),
  },
  {
    fredId: "DTWEXBGS",
    code: "sched_fred_DTWEXBGS",
    granularity: "DAILY",
    releasePackageId: "us.frb.h10_fx",
    releaseRule: () => defaultReleaseRuleForGranularity("DAILY"),
  },
  {
    fredId: "NFCI",
    code: "sched_fred_NFCI",
    granularity: "WEEKLY",
    releasePackageId: "us.chicagofed.nfci",
    releaseRule: () => defaultReleaseRuleForGranularity("WEEKLY"),
  },
  {
    fredId: "ICSA",
    code: "sched_fred_ICSA",
    granularity: "WEEKLY",
    releasePackageId: "us.dol.weekly_claims",
    releaseRule: () => defaultEconomicCalendarRule("WEEKLY"),
  },
  {
    fredId: "DCOILWTICO",
    code: "sched_fred_DCOILWTICO",
    granularity: "DAILY",
    releasePackageId: "us.eia.spot_prices",
    releaseRule: () => defaultReleaseRuleForGranularity("DAILY"),
  },
  {
    fredId: "VIXCLS",
    code: "sched_fred_VIXCLS",
    granularity: "DAILY",
    releasePackageId: "us.cboe.market_statistics",
    releaseRule: () => defaultReleaseRuleForGranularity("DAILY"),
  },
] as const;
