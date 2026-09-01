import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import type { ReleaseRule } from "./releaseRule";

/**
 * FRED 将该工具正式命名为 Standing Repo (SRP) Operations Rate；
 * 市场与美联储政策材料通常称设施本身为 Standing Repo Facility (SRF)。
 */
export type StandingRepoFredSeedRow = {
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

export const STANDING_REPO_FRED_SERIES: readonly StandingRepoFredSeedRow[] = [
  {
    fredId: "SRFTSYD",
    code: "sched_fred_SRFTSYD",
    name: "美联储常备回购便利（SRF）操作利率",
    displayName: "美联储常备回购便利（SRF）操作利率",
    freqLabel: "日",
    granularity: "DAILY",
    unit: "%",
    category: "银行与货币",
    source: "New York Fed/FRED",
    sourceUpdateNote: "纽约联储 Temporary Open Market Operations；日频探测",
    releasePackageId: "us.nyfed.rrp",
  },
] as const;

export function buildStandingRepoInstrumentMetadata(
  item: StandingRepoFredSeedRow,
  opts?: {
    existing?: Record<string, unknown> | null;
    dataLastObsDateIso?: string | null;
  },
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(opts?.existing ?? {}),
    sourceTag: "standing-repo-fred-seed",
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

/** FRED 官方 Release 每个工作日更新；按同 Release 的现有包每 24 小时探测。 */
export function releaseRuleForStandingRepo(): ReleaseRule {
  return { type: "probe_interval", intervalHours: 24 };
}
