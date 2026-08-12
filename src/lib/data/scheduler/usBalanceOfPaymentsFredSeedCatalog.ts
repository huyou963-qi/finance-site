import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";

/**
 * 美国国际收支 — BEA/FRED 种子目录
 *
 * Spec: docs/specs/us-balance-of-payments.spec.md
 * 全部序列均为季度发布，按 FRED 官方 Release 分别归入
 * U.S. International Transactions 与 U.S. International Investment Position。
 */

export type UsBalanceOfPaymentsFredSeedRow = {
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
  releasePackageId: "us.bea.international_transactions" | "us.bea.iip";
  historyStartYear: number;
};

function bopFredRow(
  fredId: string,
  displayName: string,
  releasePackageId: UsBalanceOfPaymentsFredSeedRow["releasePackageId"],
  historyStartYear: number,
): UsBalanceOfPaymentsFredSeedRow {
  const isIip = releasePackageId === "us.bea.iip";
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name: displayName,
    displayName,
    freqLabel: "季",
    granularity: "QUARTERLY",
    unit: "百万美元",
    category: "对外贸易与汇率",
    countryCode: "US",
    source: "BEA/FRED",
    sourceUpdateNote: isIip
      ? "美国国际投资头寸（季度期末，未季调）"
      : "美国国际交易账户（季度，季调）",
    releasePackageId,
    historyStartYear,
  };
}

export const US_BALANCE_OF_PAYMENTS_FRED_SERIES: readonly UsBalanceOfPaymentsFredSeedRow[] = [
  bopFredRow("IEABCS", "服务差额", "us.bea.international_transactions", 1999),
  bopFredRow("IEABCPI", "初次收入差额", "us.bea.international_transactions", 1999),
  bopFredRow("IEABCSI", "二次收入差额", "us.bea.international_transactions", 1999),
  bopFredRow(
    "IEAA",
    "美国取得对外金融资产（不含衍生品）",
    "us.bea.international_transactions",
    1999,
  ),
  bopFredRow(
    "IEAI",
    "美国发生对外金融负债（不含衍生品）",
    "us.bea.international_transactions",
    1999,
  ),
  bopFredRow("IEANLF", "金融账户净借贷", "us.bea.international_transactions", 1999),
  bopFredRow("IEAIDI", "直接投资负债流量", "us.bea.international_transactions", 1999),
  bopFredRow("IEAIPI", "证券投资负债流量", "us.bea.international_transactions", 1999),
  bopFredRow("IEAIOI", "其他投资负债流量", "us.bea.international_transactions", 1999),
  bopFredRow("IIPDIRELMVQ", "直接投资负债存量（市场价值）", "us.bea.iip", 2006),
  bopFredRow("IIPPORTLQ", "证券投资负债存量", "us.bea.iip", 2006),
  bopFredRow("IIPOTHELQ", "其他投资负债存量", "us.bea.iip", 2006),
] as const;

export const US_BALANCE_OF_PAYMENTS_FRED_IDS = US_BALANCE_OF_PAYMENTS_FRED_SERIES.map(
  (row) => row.fredId,
);

export function buildUsBalanceOfPaymentsInstrumentMetadata(
  row: UsBalanceOfPaymentsFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(opts?.existing ?? {}),
    sourceTag: "us-balance-of-payments-fred-seed",
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
    seasonalAdjustment:
      row.releasePackageId === "us.bea.iip" ? "未季调，季度期末" : "季调",
  };
  if (opts?.dataLastObsDateIso) next.dataLastObsDateIso = opts.dataLastObsDateIso;
  return next;
}

export function releaseRuleForUsBalanceOfPaymentsFred(
  _row: UsBalanceOfPaymentsFredSeedRow,
) {
  return { type: "probe_interval" as const, intervalHours: 168 };
}
