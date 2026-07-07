import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import {
  defaultEconomicCalendarRule,
  defaultReleaseRuleForGranularity,
} from "./releaseRule";

/**
 * 美国住房与地产 — FRED 种子目录
 *
 * Spec: docs/specs/us-housing.spec.md
 * 兼含两类调度：月频 Census 系列（New Residential Construction/Sales、Existing Home Sales）
 * 有官方发布日历 → economic_calendar，挂日历型发布包；周/季频（抵押利率、自有率、拖欠率）
 * 无日历事件 → probe_interval，挂 probe 型发布包。分组依据 FRED 官方 Release 字段。
 */

/** 该序列走日历型还是探测型调度 */
export type HousingScheduleKind = "calendar" | "probe";

export type HousingFredSeedRow = {
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
  scheduleKind: HousingScheduleKind;
  /** 所属发布包（verify 断言用；发布包成员规则以 releasePackageCatalog.ts 为准） */
  releasePackageId: string;
};

function housingFredSourceMeta(fredId: string): { source: string; sourceUpdateNote: string } {
  if (fredId === "PERMIT" || fredId === "HOUST1F" || fredId === "COMPUTSA") {
    return { source: "Census/FRED", sourceUpdateNote: "新建住宅月报（New Residential Construction）" };
  }
  if (fredId === "HSN1F" || fredId === "MSACSR") {
    return { source: "Census/FRED", sourceUpdateNote: "新屋销售月报（New Residential Sales）" };
  }
  if (fredId === "EXHOSLUSM495S") {
    return { source: "NAR/FRED", sourceUpdateNote: "成屋销售月报（NAR）" };
  }
  if (fredId === "MORTGAGE30US" || fredId === "MORTGAGE15US") {
    return { source: "Freddie Mac/FRED", sourceUpdateNote: "PMMS 周度（每周四）" };
  }
  if (fredId === "RHORUSQ156N") {
    return { source: "Census/FRED", sourceUpdateNote: "住房空置与自有率季报" };
  }
  return { source: "Fed/FRED", sourceUpdateNote: "季度（Charge-Off and Delinquency Rates）" };
}

function housingFredRow(
  fredId: string,
  displayName: string,
  category: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
  scheduleKind: HousingScheduleKind,
  releasePackageId: string,
): HousingFredSeedRow {
  const { source, sourceUpdateNote } = housingFredSourceMeta(fredId);
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
    scheduleKind,
    releasePackageId,
  };
}

export function buildHousingInstrumentMetadata(
  row: HousingFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const existing = opts?.existing ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    sourceTag: "housing-fred-seed",
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

/** 本维度新 seed 的 10 条 FRED 序列 */
export const HOUSING_FRED_SERIES: readonly HousingFredSeedRow[] = [
  housingFredRow("PERMIT", "建筑许可", "固定资产与地产", "月", "MONTHLY", "千套(SAAR)", "calendar", "us.bls.housing_starts"),
  housingFredRow("HOUST1F", "单户新屋开工", "固定资产与地产", "月", "MONTHLY", "千套(SAAR)", "calendar", "us.bls.housing_starts"),
  housingFredRow("COMPUTSA", "住房完工", "固定资产与地产", "月", "MONTHLY", "千套(SAAR)", "calendar", "us.bls.housing_starts"),
  housingFredRow("HSN1F", "新屋销售", "固定资产与地产", "月", "MONTHLY", "千套(SAAR)", "calendar", "us.census.new_home_sales"),
  housingFredRow("MSACSR", "新屋可售月数", "固定资产与地产", "月", "MONTHLY", "月", "calendar", "us.census.new_home_sales"),
  housingFredRow("EXHOSLUSM495S", "成屋销售", "固定资产与地产", "月", "MONTHLY", "套(SAAR)", "calendar", "us.nar.existing_home_sales"),
  housingFredRow("MORTGAGE30US", "30Y 抵押利率", "固定资产与地产", "周", "WEEKLY", "%", "probe", "us.freddiemac.pmms"),
  housingFredRow("MORTGAGE15US", "15Y 抵押利率", "固定资产与地产", "周", "WEEKLY", "%", "probe", "us.freddiemac.pmms"),
  housingFredRow("RHORUSQ156N", "自有住房率", "固定资产与地产", "季", "QUARTERLY", "%", "probe", "us.census.homeownership"),
  housingFredRow("DRSFRMACBS", "单户住宅抵押贷款拖欠率", "固定资产与地产", "季", "QUARTERLY", "%", "probe", "us.frb.chargeoff_delinquency"),
] as const;

/** 已由其他 seed 入库、本维度直接复用（不重复 seed） */
export const HOUSING_FRED_REUSED: readonly {
  fredId: string;
  code: string;
  seededBy: string;
  granularity: DataGranularity;
  unitIfMissing: string;
  expectedReleasePackageId: string;
}[] = [
  {
    fredId: "CSUSHPINSA",
    code: "sched_fred_CSUSHPINSA",
    seededBy: "phase2",
    granularity: "MONTHLY",
    unitIfMissing: "指数",
    expectedReleasePackageId: "us.case_shiller",
  },
] as const;

export const HOUSING_FRED_IDS = new Set(HOUSING_FRED_SERIES.map((x) => x.fredId));

/**
 * 调度规则：月频 Census 系列走经济日历（发布包会填 calendarMatch）；
 * 周/季频走 probe_interval（周 24h 每日探测、季 168h）。
 */
export function releaseRuleForHousingFred(row: HousingFredSeedRow) {
  if (row.scheduleKind === "calendar") {
    return defaultEconomicCalendarRule(row.granularity);
  }
  if (row.granularity === "WEEKLY") {
    return { type: "probe_interval" as const, intervalHours: 24 };
  }
  return defaultReleaseRuleForGranularity(row.granularity);
}
