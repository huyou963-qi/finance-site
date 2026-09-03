import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import type { ReleaseRule } from "./releaseRule";

/**
 * BEA NIPA 企业利润（Table 1.12 / 1.14），连接宏观增长周期与股票盈利周期。
 *
 * FRED 页面把这两条归到与 GDP 相同的 "Release: Gross Domestic Product"，但实际
 * 更新节奏与 GDP 不同——企业利润从 GDP 的"第二次估计"才开始披露（提前值缺失），
 * 第三次估计再修订，比既有 `us.bea.gdp` 包锁定的"advance GDP" 日历事件晚。
 * 为避免复用会导致按 advance-GDP 日历过早/错位探测，这里单独建 probePkg，
 * 按季度探测实际是否已出现新值，不依赖具体公告日。
 */
export type CorporateProfitsFredSeedRow = {
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

export const CORPORATE_PROFITS_FRED_SERIES: readonly CorporateProfitsFredSeedRow[] = [
  {
    fredId: "CP",
    code: "sched_fred_CP",
    name: "Corporate Profits After Tax (without IVA and CCAdj)",
    displayName: "企业税后利润（NIPA，不含存货计价/资本消耗调整）",
    freqLabel: "季度",
    granularity: "QUARTERLY",
    unit: "十亿美元(SAAR)",
    category: "国民经济核算",
    source: "BEA/FRED",
    sourceUpdateNote: "随 GDP 第二/三次估计发布，滞后于 advance GDP 约 1 个月起披露",
    releasePackageId: "us.bea.corporate_profits",
  },
  {
    fredId: "A053RC1Q027SBEA",
    code: "sched_fred_A053RC1Q027SBEA",
    name: "National income: Corporate profits before tax (without IVA and CCAdj)",
    displayName: "企业税前利润（NIPA，不含存货计价/资本消耗调整）",
    freqLabel: "季度",
    granularity: "QUARTERLY",
    unit: "十亿美元(SAAR)",
    category: "国民经济核算",
    source: "BEA/FRED",
    sourceUpdateNote: "随 GDP 第二/三次估计发布，滞后于 advance GDP 约 1 个月起披露",
    releasePackageId: "us.bea.corporate_profits",
  },
] as const;

export function buildCorporateProfitsInstrumentMetadata(
  item: CorporateProfitsFredSeedRow,
  opts?: {
    existing?: Record<string, unknown> | null;
    dataLastObsDateIso?: string | null;
  },
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(opts?.existing ?? {}),
    sourceTag: "corporate-profits-fred-seed",
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

/** 季度探测，168 小时间隔（对齐既有季频 probePkg，如 us.bea.iip）。 */
export function releaseRuleForCorporateProfits(): ReleaseRule {
  return { type: "probe_interval", intervalHours: 168 };
}
