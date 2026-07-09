import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import {
  defaultEconomicCalendarRule,
  defaultReleaseRuleForGranularity,
} from "./releaseRule";

/**
 * 美国消费与居民资产负债 — FRED 种子目录
 *
 * Spec: docs/specs/us-consumer-balance.spec.md
 * 月频 BEA/Census 走经济日历；G.19 月频 / Z.1·DSR 季频走 probe_interval。
 * 分组依据 FRED 官方 Release 字段。
 */

export type ConsumerBalanceScheduleKind = "calendar" | "probe";

export type ConsumerBalanceFredSeedRow = {
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
  scheduleKind: ConsumerBalanceScheduleKind;
  releasePackageId: string;
};

function consumerBalanceFredSourceMeta(fredId: string): {
  source: string;
  sourceUpdateNote: string;
} {
  if (fredId === "RSXFS") {
    return { source: "Census/FRED", sourceUpdateNote: "Advance Monthly Sales for Retail and Food Services" };
  }
  if (fredId === "PCEDGC96" || fredId === "PCESC96" || fredId === "PSAVERT") {
    return { source: "BEA/FRED", sourceUpdateNote: "Personal Income and Outlays" };
  }
  if (fredId === "TOTALSL" || fredId === "REVOLSL") {
    return { source: "Fed/FRED", sourceUpdateNote: "G.19 Consumer Credit" };
  }
  if (fredId === "TNWBSHNO") {
    return { source: "Fed/FRED", sourceUpdateNote: "Z.1 Financial Accounts" };
  }
  if (fredId === "TDSP") {
    return { source: "Fed/FRED", sourceUpdateNote: "Household Debt Service Ratios" };
  }
  return { source: "Fed/FRED", sourceUpdateNote: "Charge-Off and Delinquency Rates" };
}

function consumerBalanceFredRow(
  fredId: string,
  displayName: string,
  category: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
  scheduleKind: ConsumerBalanceScheduleKind,
  releasePackageId: string,
): ConsumerBalanceFredSeedRow {
  const { source, sourceUpdateNote } = consumerBalanceFredSourceMeta(fredId);
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

export function buildConsumerBalanceInstrumentMetadata(
  row: ConsumerBalanceFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const existing = opts?.existing ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    sourceTag: "consumer-balance-fred-seed",
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
export const CONSUMER_BALANCE_FRED_SERIES: readonly ConsumerBalanceFredSeedRow[] = [
  consumerBalanceFredRow(
    "RSXFS",
    "零售销售（零售贸易）",
    "国内贸易与消费",
    "月",
    "MONTHLY",
    "百万美元",
    "calendar",
    "us.bls.retail_sales",
  ),
  consumerBalanceFredRow(
    "PCEDGC96",
    "实际 PCE 耐用品",
    "国内贸易与消费",
    "月",
    "MONTHLY",
    "十亿美元",
    "calendar",
    "us.bea.personal_income",
  ),
  consumerBalanceFredRow(
    "PCESC96",
    "实际 PCE 服务",
    "国内贸易与消费",
    "月",
    "MONTHLY",
    "十亿美元",
    "calendar",
    "us.bea.personal_income",
  ),
  consumerBalanceFredRow(
    "PSAVERT",
    "个人储蓄率",
    "国内贸易与消费",
    "月",
    "MONTHLY",
    "%",
    "calendar",
    "us.bea.personal_income",
  ),
  consumerBalanceFredRow(
    "TNWBSHNO",
    "家庭净财富",
    "银行与货币",
    "季",
    "QUARTERLY",
    "百万美元",
    "probe",
    "us.frb.z1_household",
  ),
  consumerBalanceFredRow(
    "TDSP",
    "家庭偿债比率",
    "银行与货币",
    "季",
    "QUARTERLY",
    "%",
    "probe",
    "us.frb.household_dsr",
  ),
  consumerBalanceFredRow(
    "TOTALSL",
    "总消费信贷",
    "银行与货币",
    "月",
    "MONTHLY",
    "百万美元",
    "probe",
    "us.frb.g19_consumer_credit",
  ),
  consumerBalanceFredRow(
    "REVOLSL",
    "循环消费信贷",
    "银行与货币",
    "月",
    "MONTHLY",
    "百万美元",
    "probe",
    "us.frb.g19_consumer_credit",
  ),
  consumerBalanceFredRow(
    "CORCCACBS",
    "信用卡贷款核销率",
    "银行与货币",
    "季",
    "QUARTERLY",
    "%",
    "probe",
    "us.frb.chargeoff_delinquency",
  ),
] as const;

/** 已由其他 seed 入库、本维度直接复用（不重复 seed） */
export const CONSUMER_BALANCE_FRED_REUSED: readonly {
  fredId: string;
  code: string;
  seededBy: string;
  granularity: DataGranularity;
  unitIfMissing: string;
  expectedReleasePackageId: string;
}[] = [
  {
    fredId: "UMCSENT",
    code: "sched_fred_UMCSENT",
    seededBy: "phase2",
    granularity: "MONTHLY",
    unitIfMissing: "指数",
    expectedReleasePackageId: "us.umich.sentiment",
  },
] as const;

export const CONSUMER_BALANCE_FRED_IDS = new Set(
  CONSUMER_BALANCE_FRED_SERIES.map((x) => x.fredId),
);

export function releaseRuleForConsumerBalanceFred(row: ConsumerBalanceFredSeedRow) {
  if (row.scheduleKind === "calendar") {
    return defaultEconomicCalendarRule(row.granularity);
  }
  if (row.granularity === "MONTHLY") {
    return { type: "probe_interval" as const, intervalHours: 72 };
  }
  return defaultReleaseRuleForGranularity(row.granularity);
}
