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
 * 同一目录还收 BTS 铁路货运月度两条（RAILFRTCARLOADSD11 车皮数 / RAILFRTINTERMODALD11
 * 联运箱量，季调，2000 年起），2026-09-21 替代已移除的 AAR 周度抓取：aar.org 对机房 IP
 * 下发人机验证（403 challenge），属反爬、不绕过；BTS 这两条本身就汇总自 AAR 周报。
 * 每行自带 releasePackageId（Cass 与 BTS 各一个包）。
 *
 * 目录归类：`usCatalogTaxonomy.placementFromFredId` 对这 4 个 ID 显式映射到
 * 「国民经济 > 物流与出行」；前台经 `FRED_US_ITEMS` 以 `fred:<ID>` 呈现。
 *
 * seed 同时写入 `fetchAcquisition: known`（FRED 序列 ID 已人工核实存在），
 * 否则新序列要等单独跑 data:probe-sources 才会被调度器选中。
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
  {
    fredId: "RAILFRTCARLOADSD11",
    code: "sched_fred_RAILFRTCARLOADSD11",
    name: "Rail Freight Carloads",
    displayName: "铁路货运车皮数（季调）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "车皮",
    category: "物流与出行",
    source: "U.S. Bureau of Transportation Statistics/FRED",
    sourceUpdateNote: "BTS 运输服务指数（TSI）月度数据，汇总自 AAR 周报，季调；滞后约 2 个月",
    releasePackageId: "us.bts.rail_freight",
  },
  {
    fredId: "RAILFRTINTERMODALD11",
    code: "sched_fred_RAILFRTINTERMODALD11",
    name: "Rail Freight Intermodal Traffic",
    displayName: "铁路联运箱量（季调）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "集装箱及挂车",
    category: "物流与出行",
    source: "U.S. Bureau of Transportation Statistics/FRED",
    sourceUpdateNote: "BTS 运输服务指数（TSI）月度数据，汇总自 AAR 周报，季调；滞后约 2 个月",
    releasePackageId: "us.bts.rail_freight",
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
  if (!metadata.fetchAcquisition) {
    metadata.fetchAcquisition = {
      status: "known",
      method: "subscription_fred",
      methodLabel: "FRED 定时订阅 API",
      officialUrl: `https://fred.stlouisfed.org/series/${item.fredId}`,
      probedAt: new Date().toISOString(),
      message: "FRED 序列 ID 已人工核实存在（seed 预标 known）",
    };
  }
  if (opts?.dataLastObsDateIso) metadata.dataLastObsDateIso = opts.dataLastObsDateIso;
  return metadata;
}

/** 两条序列同源同批发布，月频探测（对齐既有 us.nyfed.empire_state 等 72 小时间隔）。 */
export function releaseRuleForCassFreightIndex(): ReleaseRule {
  return { type: "probe_interval", intervalHours: 72 };
}
