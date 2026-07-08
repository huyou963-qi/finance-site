import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import { defaultEconomicCalendarRule } from "./releaseRule";

/**
 * 美国增长动能与衰退风险 — FRED 种子目录
 *
 * Spec: docs/specs/us-cycle-risk.spec.md
 * 6 条新 FRED（衰退概率/规则/收入销售动能）；CFNAI/USREC 复用 phase2，
 * NY Fed 衰退概率复用 Agent C（mds:nyfed_us_recession_prob）。
 * BEA 个人收入/GDP 系列走经济日历；其余月频 probe。
 */

export type CycleRiskScheduleKind = "calendar" | "probe";

export type CycleRiskFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  legacyCategory: string;
  countryCode: "US";
  source: string;
  sourceUpdateNote: string;
  scheduleKind: CycleRiskScheduleKind;
  releasePackageId: string;
};

function sourceMeta(fredId: string): { source: string; sourceUpdateNote: string } {
  if (fredId === "RECPROUSM156N") {
    return { source: "圣路易斯联储/FRED", sourceUpdateNote: "平滑衰退概率（Chauvet-Piger），月度" };
  }
  if (fredId === "SAHMREALTIME") {
    return { source: "FRED", sourceUpdateNote: "Sahm 规则实时值，随就业报告月度更新" };
  }
  if (fredId === "W875RX1" || fredId === "DSPIC96") {
    return { source: "BEA/FRED", sourceUpdateNote: "BEA 个人收入与支出月报" };
  }
  if (fredId === "CMRMTSPL") {
    return { source: "Census/BEA/FRED", sourceUpdateNote: "实际制造与贸易销售，月度" };
  }
  return { source: "BEA/FRED", sourceUpdateNote: "BEA 国民经济核算（GDP 季报）" };
}

function cycleRiskRow(
  fredId: string,
  displayName: string,
  legacyCategory: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
  scheduleKind: CycleRiskScheduleKind,
  releasePackageId: string,
): CycleRiskFredSeedRow {
  const { source, sourceUpdateNote } = sourceMeta(fredId);
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name: displayName,
    displayName,
    freqLabel,
    granularity,
    unit,
    legacyCategory,
    countryCode: "US",
    source,
    sourceUpdateNote,
    scheduleKind,
    releasePackageId,
  };
}

export function buildCycleRiskInstrumentMetadata(
  row: CycleRiskFredSeedRow,
  opts?: { dataLastObsDateIso?: string | null; existing?: Record<string, unknown> | null },
): Record<string, unknown> {
  const existing = opts?.existing ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    sourceTag: "cycle-risk-fred-seed",
    source: row.source,
    sourceUpdateNote: row.sourceUpdateNote,
    countryCode: row.countryCode,
    countryNameZh: "美国",
    displayName: row.displayName,
    catalogCategory: usMetadataCatalogCategory({
      code: row.code,
      fredId: row.fredId,
      label: row.displayName,
      legacyCategory: row.legacyCategory,
    }),
    freqLabel: row.freqLabel,
    unit: row.unit,
    catalogKey: `fred:${row.fredId}`,
  };
  if (opts?.dataLastObsDateIso) next.dataLastObsDateIso = opts.dataLastObsDateIso;
  return next;
}

/** 6 条新 seed 的 FRED 序列 */
export const CYCLE_RISK_FRED_SERIES: readonly CycleRiskFredSeedRow[] = [
  cycleRiskRow("RECPROUSM156N", "平滑衰退概率（Chauvet-Piger）", "领先与深度", "月", "MONTHLY", "分数", "probe", "us.stlouisfed.recession_prob"),
  cycleRiskRow("SAHMREALTIME", "Sahm 规则实时值", "领先与深度", "月", "MONTHLY", "pp", "probe", "us.stlouisfed.sahm"),
  cycleRiskRow("W875RX1", "实际个人收入(除转移支付)", "国内贸易与消费", "月", "MONTHLY", "十亿美元", "calendar", "us.bea.personal_income"),
  cycleRiskRow("CMRMTSPL", "实际制造与贸易销售", "国内贸易与消费", "月", "MONTHLY", "百万美元", "probe", "us.census.mfg_trade_sales"),
  cycleRiskRow("DSPIC96", "实际可支配个人收入", "国内贸易与消费", "月", "MONTHLY", "十亿美元", "calendar", "us.bea.personal_income"),
  cycleRiskRow("FINSLC1", "实际最终销售", "国民经济核算", "季", "QUARTERLY", "十亿美元", "calendar", "us.bea.gdp"),
] as const;

/** 复用序列（不重复 seed，仅断言存在；nyfed 为 mds 抓取序列） */
export const CYCLE_RISK_REUSED: readonly {
  fredId?: string;
  code: string;
  seededBy: string;
  granularity: DataGranularity;
  unitIfMissing?: string;
}[] = [
  { fredId: "CFNAI", code: "sched_fred_CFNAI", seededBy: "phase2", granularity: "MONTHLY", unitIfMissing: "指数" },
  { fredId: "USREC", code: "sched_fred_USREC", seededBy: "phase2", granularity: "MONTHLY", unitIfMissing: "0/1" },
  { code: "nyfed_us_recession_prob", seededBy: "nyfed-recession（Agent C）", granularity: "MONTHLY" },
] as const;

export const CYCLE_RISK_FRED_IDS = new Set(CYCLE_RISK_FRED_SERIES.map((x) => x.fredId));

/** 月频 BEA 个人收入/GDP 走经济日历；其余走 probe_interval（月/季均 168h，无 TE 日历事件） */
export function releaseRuleForCycleRiskFred(row: CycleRiskFredSeedRow) {
  if (row.scheduleKind === "calendar") {
    return defaultEconomicCalendarRule(row.granularity);
  }
  return { type: "probe_interval" as const, intervalHours: 168 };
}
