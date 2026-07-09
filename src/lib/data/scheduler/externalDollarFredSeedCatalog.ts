import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import {
  defaultEconomicCalendarRule,
  defaultReleaseRuleForGranularity,
} from "./releaseRule";

/**
 * 美国对外部门与美元 — FRED 种子目录
 *
 * Spec: docs/specs/us-external-dollar.spec.md
 * 月频贸易/进出口价格有官方发布日历 → economic_calendar；
 * 日频 H.10 汇率与季频 BEA 国际账户无 TE 日历事件 → probe_interval。
 */

export type ExternalDollarScheduleKind = "calendar" | "probe";

export type ExternalDollarFredSeedRow = {
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
  scheduleKind: ExternalDollarScheduleKind;
  releasePackageId: string;
};

function externalDollarFredSourceMeta(fredId: string): {
  source: string;
  sourceUpdateNote: string;
} {
  if (
    fredId === "DTWEXAFEGS" ||
    fredId === "DTWEXEMEGS" ||
    fredId === "DTWEXBGS" ||
    fredId === "DEXUSEU"
  ) {
    return { source: "Fed/FRED", sourceUpdateNote: "H.10 外汇汇率（日）" };
  }
  if (fredId === "BOPGSTB" || fredId === "BOPTEXP" || fredId === "BOPTIMP") {
    return {
      source: "Census/BEA/FRED",
      sourceUpdateNote: "美国商品与服务国际贸易月报（FT-900）",
    };
  }
  if (fredId === "IEABC") {
    return { source: "BEA/FRED", sourceUpdateNote: "美国国际交易账户（季）" };
  }
  if (fredId === "IIPUSNETIQ") {
    return { source: "BEA/FRED", sourceUpdateNote: "美国国际投资头寸（季末）" };
  }
  if (fredId === "IQ" || fredId === "IR") {
    return { source: "BLS/FRED", sourceUpdateNote: "进出口价格指数月报" };
  }
  return { source: "BEA/FRED", sourceUpdateNote: "GDP 季报（贸易条件）" };
}

function externalDollarFredRow(
  fredId: string,
  displayName: string,
  category: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
  scheduleKind: ExternalDollarScheduleKind,
  releasePackageId: string,
): ExternalDollarFredSeedRow {
  const { source, sourceUpdateNote } = externalDollarFredSourceMeta(fredId);
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

export function buildExternalDollarInstrumentMetadata(
  row: ExternalDollarFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const existing = opts?.existing ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    sourceTag: "external-dollar-fred-seed",
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
export const EXTERNAL_DOLLAR_FRED_SERIES: readonly ExternalDollarFredSeedRow[] = [
  externalDollarFredRow(
    "DTWEXAFEGS",
    "AFE 美元指数",
    "对外贸易与汇率",
    "日",
    "DAILY",
    "指数(2006=100)",
    "probe",
    "us.frb.h10_fx",
  ),
  externalDollarFredRow(
    "DTWEXEMEGS",
    "EME 美元指数",
    "对外贸易与汇率",
    "日",
    "DAILY",
    "指数(2006=100)",
    "probe",
    "us.frb.h10_fx",
  ),
  externalDollarFredRow(
    "BOPGSTB",
    "商品与服务贸易差额",
    "对外贸易与汇率",
    "月",
    "MONTHLY",
    "百万美元",
    "calendar",
    "us.census.international_trade",
  ),
  externalDollarFredRow(
    "BOPTEXP",
    "出口（BOP）",
    "对外贸易与汇率",
    "月",
    "MONTHLY",
    "百万美元",
    "calendar",
    "us.census.international_trade",
  ),
  externalDollarFredRow(
    "BOPTIMP",
    "进口（BOP）",
    "对外贸易与汇率",
    "月",
    "MONTHLY",
    "百万美元",
    "calendar",
    "us.census.international_trade",
  ),
  externalDollarFredRow(
    "IEABC",
    "经常账户余额",
    "对外贸易与汇率",
    "季",
    "QUARTERLY",
    "百万美元",
    "probe",
    "us.bea.international_transactions",
  ),
  externalDollarFredRow(
    "IIPUSNETIQ",
    "净国际投资头寸",
    "对外贸易与汇率",
    "季",
    "QUARTERLY",
    "百万美元",
    "probe",
    "us.bea.iip",
  ),
  externalDollarFredRow(
    "IQ",
    "出口价格指数",
    "对外贸易与汇率",
    "月",
    "MONTHLY",
    "指数(2000=100)",
    "calendar",
    "us.bls.import_export_prices",
  ),
  externalDollarFredRow(
    "IR",
    "进口价格指数",
    "对外贸易与汇率",
    "月",
    "MONTHLY",
    "指数(2000=100)",
    "calendar",
    "us.bls.import_export_prices",
  ),
  externalDollarFredRow(
    "W369RG3Q066SBEA",
    "贸易条件指数",
    "对外贸易与汇率",
    "季",
    "QUARTERLY",
    "指数",
    "calendar",
    "us.bea.gdp",
  ),
] as const;

/** 已由 phase2 入库、本维度复用（不重复 seed；DTWEXBGS 进模板，DEXUSEU 仅归包） */
export const EXTERNAL_DOLLAR_FRED_REUSED: readonly {
  fredId: string;
  code: string;
  seededBy: string;
  granularity: DataGranularity;
  unitIfMissing: string;
  expectedReleasePackageId: string;
  inTemplate: boolean;
}[] = [
  {
    fredId: "DTWEXBGS",
    code: "sched_fred_DTWEXBGS",
    seededBy: "phase2",
    granularity: "DAILY",
    unitIfMissing: "指数(2006=100)",
    expectedReleasePackageId: "us.frb.h10_fx",
    inTemplate: true,
  },
  {
    fredId: "DEXUSEU",
    code: "sched_fred_DEXUSEU",
    seededBy: "phase2",
    granularity: "DAILY",
    unitIfMissing: "美元/欧元",
    expectedReleasePackageId: "us.frb.h10_fx",
    inTemplate: false,
  },
] as const;

export const EXTERNAL_DOLLAR_FRED_IDS = new Set(
  EXTERNAL_DOLLAR_FRED_SERIES.map((x) => x.fredId),
);

export function releaseRuleForExternalDollarFred(row: ExternalDollarFredSeedRow) {
  if (row.scheduleKind === "calendar") {
    return defaultEconomicCalendarRule(row.granularity);
  }
  if (row.granularity === "DAILY") {
    return { type: "probe_interval" as const, intervalHours: 24 };
  }
  return defaultReleaseRuleForGranularity(row.granularity);
}
