import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import type { ReleaseRule } from "./releaseRule";

/**
 * 圣路易斯联储金融压力指数（STLFSI4）——与既有 Chicago Fed NFCI/ANFCI
 * 独立编制方法论，用于交叉验证金融条件是否处于压力状态。
 * FRED 上是独立 Release（"St. Louis Fed Financial Stress Index"），不与
 * NFCI 共享官方日历，故单独建 probePkg；6小时探测捕获官方实际发布，
 * 不假定观测周五就是发布日。
 */
export type FinancialStressFredSeedRow = {
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

export const FINANCIAL_STRESS_FRED_SERIES: readonly FinancialStressFredSeedRow[] = [
  {
    fredId: "STLFSI4",
    code: "sched_fred_STLFSI4",
    name: "St. Louis Fed Financial Stress Index",
    displayName: "圣路易斯联储金融压力指数（STLFSI4）",
    freqLabel: "周",
    granularity: "WEEKLY",
    unit: "指数",
    category: "银行与货币",
    source: "St. Louis Fed/FRED",
    sourceUpdateNote: "周五结束周的未季调指数；实际更新时间以FRED官方发布为准，每6小时探测并回读修订，不把观测日当发布日期",
    releasePackageId: "us.stlouisfed.financial_stress_index",
  },
] as const;

export function buildFinancialStressInstrumentMetadata(
  item: FinancialStressFredSeedRow,
  opts?: {
    existing?: Record<string, unknown> | null;
    dataLastObsDateIso?: string | null;
  },
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(opts?.existing ?? {}),
    sourceTag: "financial-stress-fred-seed",
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

/** 周频6小时探测，覆盖官方发布和镜像到达时间的不确定性。 */
export function releaseRuleForFinancialStress(): ReleaseRule {
  return { type: "probe_interval", intervalHours: 6 };
}
