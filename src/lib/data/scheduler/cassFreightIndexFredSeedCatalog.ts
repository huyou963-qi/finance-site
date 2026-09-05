import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import type { ReleaseRule } from "./releaseRule";

/**
 * Cass 货运指数（Cass Freight Index：Shipments / Expenditures）——由 Cass
 * Information Systems 按月编制、直接落在 FRED（Release「Cass Freight Index
 * Report」，rid=280），非官方统计机构口径但为业内广泛跟踪的货运量/运费领先
 * 指标。两条序列同源同批发布，共享同一 FRED Release，故只建一个 probePkg。
 *
 * 走常规 FRED 接入路径（非抓取）：已核实两条序列均为原生 FRED_API 序列，
 * 无需网页抓取 provider（对齐 AGENTS.md「TSA/AAR」条目中记录的复用检查结论）。
 *
 * 目录归类：`usCatalogTaxonomy` 的 `国民经济` 大类下新增过一个「物流与出行」
 * 子类（分支 `claude/magical-ishizaka-97c958` 提交 8b11540，服务于 TSA/AAR
 * 抓取指标），但该分支尚未合入本分支，此处不预先改 `usCatalogTaxonomy.ts`
 * 以免与之产生冲突。改用既有「景气综合」子类（`legacyCategory: "景气调查"`，
 * 与 `regionalFedSurveysFredSeedCatalog.ts` 同法）——货运量/运费本身也是常见
 * 的经济活动领先指标，落在「景气综合」下语义上不违和。待「物流与出行」子类
 * 合入后，可把这两条序列的 `legacyCategory` 改挂过去（或在
 * `usCatalogTaxonomy.ts` 的 `placementFromFredId` 里为 FRGSHPUSM649NCIS /
 * FRGEXPUSM649NCIS 加显式映射）。
 */
export type CassFreightIndexFredSeedRow = {
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

export const CASS_FREIGHT_INDEX_FRED_SERIES: readonly CassFreightIndexFredSeedRow[] = [
  {
    fredId: "FRGSHPUSM649NCIS",
    code: "sched_fred_FRGSHPUSM649NCIS",
    name: "Cass Freight Index: Shipments",
    displayName: "Cass 货运指数：运量",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "指数(1990年1月=1)",
    category: "景气调查",
    source: "Cass Information Systems/FRED",
    sourceUpdateNote: "每月上旬发布上月数据（Cass Freight Index Report，rid=280）",
    releasePackageId: "us.cass.freight_index",
  },
  {
    fredId: "FRGEXPUSM649NCIS",
    code: "sched_fred_FRGEXPUSM649NCIS",
    name: "Cass Freight Index: Expenditures",
    displayName: "Cass 货运指数：运费支出",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "指数(1990年1月=1)",
    category: "景气调查",
    source: "Cass Information Systems/FRED",
    sourceUpdateNote: "每月上旬发布上月数据（Cass Freight Index Report，rid=280）",
    releasePackageId: "us.cass.freight_index",
  },
] as const;

export function buildCassFreightIndexInstrumentMetadata(
  item: CassFreightIndexFredSeedRow,
  opts?: {
    existing?: Record<string, unknown> | null;
    dataLastObsDateIso?: string | null;
  },
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(opts?.existing ?? {}),
    sourceTag: "cass-freight-index-fred-seed",
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

/** 两条序列同源同批发布，月频探测（对齐既有 us.nyfed.empire_state 等 72 小时间隔）。 */
export function releaseRuleForCassFreightIndex(): ReleaseRule {
  return { type: "probe_interval", intervalHours: 72 };
}
