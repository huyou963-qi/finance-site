import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import type { ReleaseRule } from "./releaseRule";

/**
 * 美国非金融企业公司债——存量与净发行流量（美联储 Z.1 资金流量表）。
 *
 * SIFMA 官网的"总发债融资规模"统计需要填 HubSpot 表单才能下载 Excel（营销线索
 * 收集，本质是注册墙），按项目规则不可抓。改用美联储自己的 Z.1 Financial
 * Accounts 数据：存量（Level）反映"总的公司债余额"，净发行流量（Transactions，
 * 已折年率）反映"当季净发债融资规模"，两条序列同一 Release，语义上比 SIFMA
 * 的口径更权威（一手央行数据，非行业协会二手统计），且直接是 FRED API，无需抓取。
 */
export type CorporateBondFinancingFredSeedRow = {
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

export const CORPORATE_BOND_FINANCING_FRED_SERIES: readonly CorporateBondFinancingFredSeedRow[] = [
  {
    fredId: "CBLBSNNCB",
    code: "sched_fred_CBLBSNNCB",
    name: "Nonfinancial Corporate Business; Corporate Bonds; Liability (Excluding Ereits), Level",
    displayName: "美国非金融企业公司债存量（不含 REITs）",
    freqLabel: "季度",
    granularity: "QUARTERLY",
    unit: "百万美元",
    category: "利率与债券",
    source: "Federal Reserve Board/FRED",
    sourceUpdateNote: "美联储 Z.1 资金流量表季度发布，随 CBLBSNNCB 更新",
    releasePackageId: "us.frb.z1_corporate_bonds",
  },
  {
    fredId: "NCBCBLQ027S",
    code: "sched_fred_NCBCBLQ027S",
    name: "Nonfinancial Corporate Business; Corporate Bonds; Liability (Excluding Ereits), Transactions",
    displayName: "美国非金融企业公司债净发行（折年率）",
    freqLabel: "季度",
    granularity: "QUARTERLY",
    unit: "百万美元(SAAR)",
    category: "利率与债券",
    source: "Federal Reserve Board/FRED",
    sourceUpdateNote: "美联储 Z.1 资金流量表季度发布，净发行=当季公司债负债变动折年率",
    releasePackageId: "us.frb.z1_corporate_bonds",
  },
] as const;

export function buildCorporateBondFinancingInstrumentMetadata(
  item: CorporateBondFinancingFredSeedRow,
  opts?: {
    existing?: Record<string, unknown> | null;
    dataLastObsDateIso?: string | null;
  },
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(opts?.existing ?? {}),
    sourceTag: "corporate-bond-financing-fred-seed",
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

/** 与 Z.1 同类既有 probePkg（如 us.frb.z1_household）一致：季度探测，168 小时间隔。 */
export function releaseRuleForCorporateBondFinancing(): ReleaseRule {
  return { type: "probe_interval", intervalHours: 168 };
}
