import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import { CPI_FRED_SERIES } from "./cpiFredSeedCatalog";
import { LABOR_FRED_SERIES } from "./laborFredSeedCatalog";
import { P0_FRED_PILOT_SERIES } from "./p0SeedCatalog";
import { PHASE2_FRED_EXTRA } from "./phase2SeedCatalog";
import { releaseRuleForPilot } from "./p0SeedCatalog";

export type OverviewFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  countryCode: "US";
  source: string;
  sourceUpdateNote: string;
};

function overviewFredSourceMeta(fredId: string): { source: string; sourceUpdateNote: string } {
  if (
    fredId === "A191RL1Q225SBEA" ||
    fredId === "PCEC96" ||
    fredId === "PCEPILFE" ||
    fredId === "PNFIC1" ||
    fredId === "PRFIC1" ||
    fredId === "EXPGSC1" ||
    fredId === "IMPGSC1" ||
    fredId === "GCEC1"
  ) {
    return { source: "BEA/FRED", sourceUpdateNote: "BEA 国民账户" };
  }
  if (fredId === "RSAFS" || fredId === "HOUST") {
    return { source: "Census/FRED", sourceUpdateNote: "Census 月报" };
  }
  if (fredId === "DFEDTARU") {
    return { source: "Fed/FRED", sourceUpdateNote: "FOMC 目标利率" };
  }
  if (fredId === "FYFSGDA188S") {
    return { source: "OMB/FRED", sourceUpdateNote: "联邦财政" };
  }
  if (fredId === "T10Y2Y") {
    return { source: "FRED", sourceUpdateNote: "交易日；模板内月均" };
  }
  if (fredId === "INDPRO") {
    return { source: "Fed/FRED", sourceUpdateNote: "Fed G.17 工业生产" };
  }
  return { source: "BLS/FRED", sourceUpdateNote: "BLS 月报" };
}

function overviewFredRow(
  fredId: string,
  displayName: string,
  category: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
): OverviewFredSeedRow {
  const { source, sourceUpdateNote } = overviewFredSourceMeta(fredId);
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name: displayName,
    displayName,
    freqLabel,
    granularity,
    unit,
    category,
    countryCode: "US",
    source,
    sourceUpdateNote,
  };
}

export function buildOverviewInstrumentMetadata(
  row: OverviewFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const existing = opts?.existing ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    sourceTag: "overview-fred-seed",
    source: row.source,
    sourceUpdateNote: row.sourceUpdateNote,
    countryCode: row.countryCode,
    countryNameZh: "美国",
    displayName: row.displayName,
    catalogCategory: usMetadataCatalogCategory({
      code: row.code,
      fredId: row.fredId,
      label: row.displayName,
      legacyCategory: row.category,
    }),
    freqLabel: row.freqLabel,
    unit: row.unit,
    catalogKey: `fred:${row.fredId}`,
  };
  if (opts?.dataLastObsDateIso) {
    next.dataLastObsDateIso = opts.dataLastObsDateIso;
  }
  return next;
}

const P0_IDS = new Set(P0_FRED_PILOT_SERIES.map((x) => x.fredId));
const PHASE2_IDS = new Set(PHASE2_FRED_EXTRA.map((x) => x.fredId));
const CPI_IDS = new Set(CPI_FRED_SERIES.map((x) => x.fredId));
const LABOR_IDS = new Set(LABOR_FRED_SERIES.map((x) => x.fredId));

export const OVERVIEW_FRED_IDS_ALREADY_SEEDED = new Set([
  ...P0_IDS,
  ...PHASE2_IDS,
  ...CPI_IDS,
  ...LABOR_IDS,
]);

/** 经济 Overview 框架 — 默认模板用到的 FRED 序列（幂等 upsert） */
export const OVERVIEW_FRED_SERIES: readonly OverviewFredSeedRow[] = [
  overviewFredRow(
    "A191RL1Q225SBEA",
    "实际 GDP 环比折年率",
    "国民经济核算",
    "季",
    "QUARTERLY",
    "%",
  ),
  overviewFredRow("INDPRO", "工业生产指数", "工业", "月", "MONTHLY", "指数"),
  overviewFredRow("PCEC96", "实际个人消费支出", "国内贸易与消费", "月", "MONTHLY", "十亿美元"),
  overviewFredRow("RSAFS", "零售销售总额", "国内贸易与消费", "月", "MONTHLY", "百万美元"),
  overviewFredRow("UNRATE", "失业率（U-3，季调）", "就业与工资", "月", "MONTHLY", "%"),
  overviewFredRow("PAYEMS", "非农就业人数", "就业与工资", "月", "MONTHLY", "千人"),
  overviewFredRow("CPIAUCSL", "CPI（全部城市消费者）", "价格指数", "月", "MONTHLY", "指数"),
  overviewFredRow("PCEPILFE", "核心 PCE", "价格指数", "月", "MONTHLY", "指数"),
  overviewFredRow("DFEDTARU", "联邦基金目标利率上限", "银行与货币", "日", "DAILY", "%"),
  overviewFredRow("T10Y2Y", "10Y-2Y 国债利差", "利率与债券", "日", "DAILY", "%"),
  overviewFredRow("PNFIC1", "实际私人固定投资", "固定资产投资", "季", "QUARTERLY", "十亿美元"),
  overviewFredRow("PRFIC1", "实际住宅固定投资", "固定资产投资", "季", "QUARTERLY", "十亿美元"),
  overviewFredRow("HOUST", "新屋开工", "固定资产与地产", "月", "MONTHLY", "千套"),
  overviewFredRow("EXPGSC1", "实际出口", "对外贸易及投资", "季", "QUARTERLY", "十亿美元"),
  overviewFredRow("IMPGSC1", "实际进口", "对外贸易及投资", "季", "QUARTERLY", "十亿美元"),
  overviewFredRow("FYFSGDA188S", "联邦赤字/GDP", "财政", "季", "QUARTERLY", "%"),
  overviewFredRow("GCEC1", "实际政府消费支出", "财政", "季", "QUARTERLY", "十亿美元"),
] as const;

export const OVERVIEW_FRED_IDS = new Set(OVERVIEW_FRED_SERIES.map((x) => x.fredId));

export function releaseRuleForOverviewFred(fredId: string, granularity: DataGranularity) {
  return releaseRuleForPilot(fredId, granularity);
}
