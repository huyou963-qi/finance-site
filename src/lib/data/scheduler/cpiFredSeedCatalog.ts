import type { DataGranularity } from "@prisma/client";
import { P0_FRED_PILOT_SERIES } from "./p0SeedCatalog";
import { PHASE2_FRED_EXTRA } from "./phase2SeedCatalog";
import { releaseRuleForPilot } from "./p0SeedCatalog";

/** BLS CPI 发布日历匹配（与 Headline 同刻发布） */
export const CPI_BLS_CALENDAR_KEYWORDS = [
  "consumer price index",
  "cpi m/m",
  "cpi (mom)",
  "cpi (mm)",
] as const;

export const CPI_BLS_CALENDAR_EXCLUDES = ["core", "y/y", "yoy", "ppi", "wage"] as const;

export type CpiFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  /** 目录/UI 显示名（与 fredCatalog label 对齐） */
  displayName: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  countryCode: "US";
  source: string;
  sourceUpdateNote: string;
};

function cpiFredSourceMeta(fredId: string): { source: string; sourceUpdateNote: string } {
  if (fredId === "DCOILWTICO") {
    return { source: "EIA/FRED", sourceUpdateNote: "交易日" };
  }
  if (fredId === "PCEPI" || fredId === "PCEPILFE") {
    return { source: "BEA/FRED", sourceUpdateNote: "PCE 月报" };
  }
  if (fredId === "T5YIE" || fredId === "T10YIE") {
    return { source: "FRED", sourceUpdateNote: "交易日" };
  }
  if (fredId === "PPIFIS") {
    return { source: "BLS/FRED", sourceUpdateNote: "BLS PPI 月报" };
  }
  if (fredId === "CES0500000003" || fredId === "UNRATE") {
    return { source: "BLS/FRED", sourceUpdateNote: "就业报告" };
  }
  return { source: "BLS/FRED", sourceUpdateNote: "BLS CPI 月报" };
}

function cpiFredRow(
  fredId: string,
  displayName: string,
  category: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
): CpiFredSeedRow {
  const { source, sourceUpdateNote } = cpiFredSourceMeta(fredId);
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

export function buildCpiInstrumentMetadata(
  row: CpiFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const existing = opts?.existing ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    sourceTag: "cpi-fred-seed",
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
const PHASE2_IDS = new Set(PHASE2_FRED_EXTRA.map((x) => x.fredId));

/** 已在 P0 / Phase2 seed 中创建 Instrument 的 FRED id（日志用） */
export const CPI_FRED_IDS_ALREADY_SEEDED = new Set([
  ...P0_IDS,
  ...PHASE2_IDS,
]);

/** 美国 CPI 分析框架 — 全部 FRED 序列（含已 seed 项，脚本幂等 upsert） */
export const CPI_FRED_SERIES: readonly CpiFredSeedRow[] = [
  cpiFredRow("CPIAUCSL", "CPI（全部城市消费者）", "CPI 综合", "月", "MONTHLY", "指数"),
  cpiFredRow("CPILFESL", "核心 CPI（剔除食物与能源）", "CPI 综合", "月", "MONTHLY", "指数"),
  cpiFredRow("CPIENGSL", "CPI 能源", "CPI 综合", "月", "MONTHLY", "指数"),
  cpiFredRow("CPIFABSL", "CPI 食品与饮料", "CPI 综合", "月", "MONTHLY", "指数"),
  cpiFredRow("CUSR0000SAH1", "CPI 住房（Shelter）", "CPI 住房", "月", "MONTHLY", "指数"),
  cpiFredRow("CUSR0000SEHA", "CPI 主要住所租金", "CPI 住房", "月", "MONTHLY", "指数"),
  cpiFredRow("CUSR0000SEHC", "CPI 业主等价租金（OER）", "CPI 住房", "月", "MONTHLY", "指数"),
  cpiFredRow("CUSR0000SACL1E", "CPI 核心商品（除食品能源）", "CPI 核心商品", "月", "MONTHLY", "指数"),
  cpiFredRow("CUSR0000SASLE", "CPI 核心服务（除能源服务）", "CPI 核心服务", "月", "MONTHLY", "指数"),
  cpiFredRow("CUSR0000SETA02", "CPI 二手车与卡车", "CPI 分项", "月", "MONTHLY", "指数"),
  cpiFredRow("CUSR0000SETA01", "CPI 新车", "CPI 分项", "月", "MONTHLY", "指数"),
  cpiFredRow("CPIMEDSL", "CPI 医疗（聚合）", "CPI 分项", "月", "MONTHLY", "指数"),
  cpiFredRow("DCOILWTICO", "WTI 原油现货", "通胀驱动因子", "日", "DAILY", "美元/桶"),
  cpiFredRow("PPIFIS", "PPI 最终需求", "通胀驱动因子", "月", "MONTHLY", "指数"),
  cpiFredRow("CES0500000003", "平均时薪（私营部门）", "通胀驱动因子", "月", "MONTHLY", "美元/小时"),
  cpiFredRow("T5YIE", "5Y 盈亏平衡通胀", "通胀驱动因子", "日", "DAILY", "%"),
  cpiFredRow("T10YIE", "10Y 盈亏平衡通胀", "通胀驱动因子", "日", "DAILY", "%"),
  cpiFredRow("PCEPI", "PCE 价格指数", "通胀驱动因子", "月", "MONTHLY", "指数"),
  cpiFredRow("PCEPILFE", "核心 PCE", "通胀驱动因子", "月", "MONTHLY", "指数"),
  cpiFredRow("UNRATE", "失业率（%）", "通胀驱动因子", "月", "MONTHLY", "%"),
] as const;

export const CPI_FRED_IDS = new Set(CPI_FRED_SERIES.map((x) => x.fredId));

export function releaseRuleForCpiFred(fredId: string, granularity: DataGranularity) {
  return releaseRuleForPilot(fredId, granularity);
}
