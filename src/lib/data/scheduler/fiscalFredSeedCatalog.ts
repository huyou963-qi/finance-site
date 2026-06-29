import type { DataGranularity } from "@prisma/client";
import { releaseRuleForPilot } from "./p0SeedCatalog";

export type FiscalFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  roleId: string;
  source: string;
  sourceUpdateNote: string;
};

function fiscalFredRow(
  fredId: string,
  displayName: string,
  roleId: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
  source: string,
  sourceUpdateNote: string,
): FiscalFredSeedRow {
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name: displayName,
    displayName,
    freqLabel,
    granularity,
    unit,
    category: "财政",
    roleId,
    source,
    sourceUpdateNote,
  };
}

/** 财政框架 FRED 序列（Overview 未覆盖部分） */
export const FISCAL_FRED_SERIES: readonly FiscalFredSeedRow[] = [
  fiscalFredRow(
    "GFDEGDQ188S",
    "联邦公共债务/GDP %",
    "us-federal-debt-gdp",
    "季",
    "QUARTERLY",
    "%",
    "OMB/FRED",
    "公共债务占名义 GDP",
  ),
  fiscalFredRow(
    "GFDEBTN",
    "联邦公共债务总额",
    "us-federal-debt-total",
    "季",
    "QUARTERLY",
    "百万美元",
    "Treasury/FRED",
    "Total Public Debt",
  ),
  fiscalFredRow(
    "FYOIGDA188S",
    "联邦利息支出/GDP %",
    "us-net-interest-gdp",
    "年",
    "ANNUAL",
    "%",
    "OMB/FRED",
    "FYOINT/GDPA；年频 OMB",
  ),
  fiscalFredRow(
    "A091RC1Q027SBEA",
    "联邦利息支出（NIPA，季调年化）",
    "us-outlays-net-interest-nipa",
    "季",
    "QUARTERLY",
    "十亿美元",
    "BEA/FRED",
    "权责制；与 MTS 现金利息口径不同",
  ),
  fiscalFredRow(
    "FGCEC1",
    "联邦消费支出与总投资（实际，2017 链价）",
    "us-gov-investment-level",
    "季",
    "QUARTERLY",
    "十亿美元",
    "BEA/FRED",
    "Real Federal Consumption Expenditures and Gross Investment",
  ),
] as const;

/** FGCEC1 同比 % — instrument code 含 _yoy 触发 fredTransform */
export const FISCAL_FRED_YOY_SERIES: readonly FiscalFredSeedRow[] = [
  {
    ...fiscalFredRow(
      "FGCEC1",
      "联邦消费支出与总投资同比 %",
      "us-gov-investment-yoy",
      "季",
      "QUARTERLY",
      "%",
      "BEA/FRED",
      "由 FGCEC1 水平值在 worker 内计算 YoY %",
    ),
    code: "fiscal_fgcec1_yoy",
  },
] as const;

export function buildFiscalFredInstrumentMetadata(
  row: FiscalFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  return {
    ...(opts?.existing ?? {}),
    sourceTag: "fiscal-fred-seed",
    source: row.source,
    sourceUpdateNote: row.sourceUpdateNote,
    countryCode: "US",
    countryNameZh: "美国",
    displayName: row.displayName,
    catalogCategory: row.category,
    freqLabel: row.freqLabel,
    unit: row.unit,
    catalogKey: `fred:${row.fredId}`,
    roleId: row.roleId,
    fetchAcquisition: {
      status: "known",
      probedAt: new Date().toISOString(),
      method: "fred_api",
      methodLabel: "FRED API",
      officialUrl: `https://fred.stlouisfed.org/series/${row.fredId}`,
      fetchUrl: `https://api.stlouisfed.org/fred/series/observations?series_id=${row.fredId}`,
      message: row.sourceUpdateNote,
    },
  };
}

export function releaseRuleForFiscalFred(fredId: string, granularity: DataGranularity) {
  return releaseRuleForPilot(fredId, granularity);
}

/** Overview 已 seed 的 FRED，fiscal seed 仅 upsert metadata */
export const FISCAL_FRED_ALREADY_IN_OVERVIEW = new Set(["FYFSGDA188S", "GCEC1"]);
