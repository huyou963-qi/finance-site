import type { DataGranularity } from "@prisma/client";
import { CPI_FRED_SERIES } from "./cpiFredSeedCatalog";
import { P0_FRED_PILOT_SERIES } from "./p0SeedCatalog";
import { releaseRuleForPilot } from "./p0SeedCatalog";

export type LaborFredSeedRow = {
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

const JOLTS_IDS = new Set(["JTSJOL", "JTSJOR", "JTSQUR", "JTSHIR"]);

function laborFredSourceMeta(fredId: string): { source: string; sourceUpdateNote: string } {
  if (fredId === "ICSA" || fredId === "CCSA") {
    return { source: "DOL/FRED", sourceUpdateNote: "每周四就业报告" };
  }
  if (JOLTS_IDS.has(fredId)) {
    return { source: "BLS/FRED", sourceUpdateNote: "BLS JOLTS 月报（滞后约 1 月）" };
  }
  if (
    fredId === "UNRATE" ||
    fredId === "U6RATE" ||
    fredId === "PAYEMS" ||
    fredId === "CIVPART" ||
    fredId === "LNS11300060" ||
    fredId === "CES0500000003" ||
    fredId === "UEMPMEAN" ||
    fredId === "AWHNONAG" ||
    fredId === "EMRATIO" ||
    fredId === "UNEMPLOY" ||
    fredId === "USPRIV" ||
    fredId === "USGOVT" ||
    fredId === "MANEMP" ||
    fredId === "AHETPI"
  ) {
    return { source: "BLS/FRED", sourceUpdateNote: "BLS 就业报告（每月第一个周五）" };
  }
  return { source: "BLS/FRED", sourceUpdateNote: "BLS 月报" };
}

function laborFredRow(
  fredId: string,
  displayName: string,
  category: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
): LaborFredSeedRow {
  const { source, sourceUpdateNote } = laborFredSourceMeta(fredId);
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

export function buildLaborInstrumentMetadata(
  row: LaborFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const existing = opts?.existing ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    sourceTag: "labor-fred-seed",
    source: row.source,
    sourceUpdateNote: row.sourceUpdateNote,
    countryCode: row.countryCode,
    countryNameZh: "美国",
    displayName: row.displayName,
    catalogCategory: row.category,
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
const CPI_IDS = new Set(CPI_FRED_SERIES.map((x) => x.fredId));

/** 已在 P0 / CPI seed 中创建 Instrument 的 FRED id（日志用） */
export const LABOR_FRED_IDS_ALREADY_SEEDED = new Set([...P0_IDS, ...CPI_IDS]);

/** 美国就业市场分析框架 — 全部 FRED 序列（幂等 upsert） */
export const LABOR_FRED_SERIES: readonly LaborFredSeedRow[] = [
  // 模板 ①（6 条）
  laborFredRow("UNRATE", "失业率（U-3，季调）", "就业与工资", "月", "MONTHLY", "%"),
  laborFredRow("U6RATE", "U-6 广义失业率", "就业与工资", "月", "MONTHLY", "%"),
  laborFredRow("PAYEMS", "非农就业人数", "就业与工资", "月", "MONTHLY", "千人"),
  laborFredRow("CIVPART", "劳动参与率", "就业与工资", "月", "MONTHLY", "%"),
  laborFredRow("LNS11300060", "25–54 岁劳动参与率", "就业与工资", "月", "MONTHLY", "%"),
  laborFredRow("CES0500000003", "平均时薪（全体私营）", "就业与工资", "月", "MONTHLY", "美元/小时"),
  // 模板 ②（6 条，JTSQUR 在模板层用 virtualKey 复制到两图）
  laborFredRow("JTSJOR", "岗位空缺率（非农）", "劳动力流动", "月", "MONTHLY", "%"),
  laborFredRow("JTSQUR", "离职率（非农）", "劳动力流动", "月", "MONTHLY", "%"),
  laborFredRow("JTSHIR", "雇佣率（非农）", "劳动力流动", "月", "MONTHLY", "%"),
  laborFredRow("ICSA", "初请失业金人数", "领先与深度", "周", "WEEKLY", "人"),
  laborFredRow("UEMPMEAN", "平均失业周数", "领先与深度", "月", "MONTHLY", "周"),
  laborFredRow("AWHNONAG", "平均周工时（生产与非监督）", "就业与工资", "月", "MONTHLY", "小时"),
  // 目录自选（8 条）
  laborFredRow("JTSJOL", "岗位空缺人数（非农）", "劳动力流动", "月", "MONTHLY", "千人"),
  laborFredRow("UNEMPLOY", "失业人数", "就业与工资", "月", "MONTHLY", "千人"),
  laborFredRow("EMRATIO", "就业人口比", "就业与工资", "月", "MONTHLY", "%"),
  laborFredRow("CCSA", "续请失业金人数", "领先与深度", "周", "WEEKLY", "人"),
  laborFredRow("USPRIV", "私营部门非农就业", "就业结构", "月", "MONTHLY", "千人"),
  laborFredRow("USGOVT", "政府部门就业", "就业结构", "月", "MONTHLY", "千人"),
  laborFredRow("MANEMP", "制造业就业", "就业结构", "月", "MONTHLY", "千人"),
  laborFredRow(
    "AHETPI",
    "生产与非监督岗位平均时薪",
    "就业与工资",
    "月",
    "MONTHLY",
    "美元/小时",
  ),
] as const;

export const LABOR_FRED_IDS = new Set(LABOR_FRED_SERIES.map((x) => x.fredId));

export const LABOR_JOLTS_FRED_IDS = new Set(
  LABOR_FRED_SERIES.filter((r) => JOLTS_IDS.has(r.fredId)).map((r) => r.fredId),
);

export function releaseRuleForLaborFred(fredId: string, granularity: DataGranularity) {
  return releaseRuleForPilot(fredId, granularity);
}
