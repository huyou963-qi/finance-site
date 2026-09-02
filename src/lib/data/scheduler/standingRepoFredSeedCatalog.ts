import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import type { ReleaseRule } from "./releaseRule";

/**
 * 纽约联储 Repo Operations 是 SRF 使用量的日频事实源，FRED 将同一
 * Temporary Open Market Operations release 映射为下列序列。
 *
 * 注意：RPON* 序列始于 2000 年，2021-07-29 SRF 启用前的观测是历史临时
 * 回购操作，只有该日及之后的接受量才可在业务层解释为 SRF 使用量。
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
    fredId: "RPONTTLD",
    code: "sched_fred_RPONTTLD",
    name: "纽约联储隔夜回购接受量（总计）",
    displayName: "SRF 使用量（隔夜回购接受量总计）",
    freqLabel: "日",
    granularity: "DAILY",
    unit: "十亿美元",
    category: "银行与货币",
    source: "New York Fed/FRED",
    sourceUpdateNote: "纽约联储 Repo Operations 每个营业日操作后发布；FRED 日频更新",
    releasePackageId: "us.nyfed.rrp",
  },
  {
    fredId: "RPONTSYD",
    code: "sched_fred_RPONTSYD",
    name: "纽约联储隔夜回购接受量：美国国债",
    displayName: "SRF 使用量：美国国债抵押品",
    freqLabel: "日",
    granularity: "DAILY",
    unit: "十亿美元",
    category: "银行与货币",
    source: "New York Fed/FRED",
    sourceUpdateNote: "纽约联储 Repo Operations 每个营业日操作后发布；FRED 日频更新",
    releasePackageId: "us.nyfed.rrp",
  },
  {
    fredId: "RPONAGYD",
    code: "sched_fred_RPONAGYD",
    name: "纽约联储隔夜回购接受量：机构债",
    displayName: "SRF 使用量：机构债抵押品",
    freqLabel: "日",
    granularity: "DAILY",
    unit: "十亿美元",
    category: "银行与货币",
    source: "New York Fed/FRED",
    sourceUpdateNote: "纽约联储 Repo Operations 每个营业日操作后发布；FRED 日频更新",
    releasePackageId: "us.nyfed.rrp",
  },
  {
    fredId: "RPONMBSD",
    code: "sched_fred_RPONMBSD",
    name: "纽约联储隔夜回购接受量：机构 MBS",
    displayName: "SRF 使用量：机构 MBS 抵押品",
    freqLabel: "日",
    granularity: "DAILY",
    unit: "十亿美元",
    category: "银行与货币",
    source: "New York Fed/FRED",
    sourceUpdateNote: "纽约联储 Repo Operations 每个营业日操作后发布；FRED 日频更新",
    releasePackageId: "us.nyfed.rrp",
  },
  {
    fredId: "RPONTSYSAD",
    code: "sched_fred_RPONTSYSAD",
    name: "纽约联储隔夜回购提交量：美国国债",
    displayName: "SRF 提交量：美国国债抵押品（非总提交量）",
    freqLabel: "日",
    granularity: "DAILY",
    unit: "十亿美元",
    category: "银行与货币",
    source: "New York Fed/FRED",
    sourceUpdateNote: "纽约联储 Repo Operations 每个营业日操作后发布；FRED 日频更新",
    releasePackageId: "us.nyfed.rrp",
  },
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
  if (item.fredId.startsWith("RPON")) {
    metadata.srfRegimeStartDate = "2021-07-29";
    metadata.interpretationNote =
      "2021-07-29 前为历史临时隔夜回购操作；此后是当前 SRF 使用量的公开日频代理。纽约联储汇总包含 small-value exercises。";
  }
  if (opts?.dataLastObsDateIso) metadata.dataLastObsDateIso = opts.dataLastObsDateIso;
  return metadata;
}

/** 纽约联储每个工作日操作后发布结果；按同 Release 的现有包每 24 小时探测。 */
export function releaseRuleForStandingRepo(): ReleaseRule {
  return { type: "probe_interval", intervalHours: 24 };
}
