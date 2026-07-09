import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import {
  defaultEconomicCalendarRule,
  defaultReleaseRuleForGranularity,
} from "./releaseRule";

/**
 * 美国制造业与库存周期 — FRED 种子目录
 *
 * Spec: docs/specs/us-industry-inventory.spec.md
 * M3 / MTIS / G.17 产能走经济日历；ISM 三条已入库，本 catalog 不重复 seed。
 */

export type IndustryInventoryScheduleKind = "calendar" | "probe";

export type IndustryInventoryFredSeedRow = {
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
  scheduleKind: IndustryInventoryScheduleKind;
  releasePackageId: string;
};

function sourceMeta(fredId: string): { source: string; sourceUpdateNote: string } {
  if (
    fredId === "DGORDER" ||
    fredId === "ADXTNO" ||
    fredId === "NEWORDER" ||
    fredId === "AMDMUO" ||
    fredId === "AMTMTI"
  ) {
    return {
      source: "Census/FRED",
      sourceUpdateNote: "制造商出货、库存与订单（M3）",
    };
  }
  if (fredId === "BUSINV" || fredId === "ISRATIO" || fredId === "MNFCTRIRSA") {
    return {
      source: "Census/FRED",
      sourceUpdateNote: "制造与贸易库存销售（MTIS）",
    };
  }
  if (fredId === "IPMAN") {
    return {
      source: "Fed/FRED",
      sourceUpdateNote: "G.17 工业生产与产能利用率（制造业产出）",
    };
  }
  return {
    source: "Fed/FRED",
    sourceUpdateNote: "G.17 工业生产与产能利用率（产能）",
  };
}

function row(
  fredId: string,
  displayName: string,
  category: string,
  unit: string,
  releasePackageId: string,
): IndustryInventoryFredSeedRow {
  const { source, sourceUpdateNote } = sourceMeta(fredId);
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name: displayName,
    displayName,
    freqLabel: "月",
    granularity: "MONTHLY",
    unit,
    category,
    countryCode: "US",
    source,
    sourceUpdateNote,
    scheduleKind: "calendar",
    releasePackageId,
  };
}

export function buildIndustryInventoryInstrumentMetadata(
  seed: IndustryInventoryFredSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const existing = opts?.existing ?? {};
  const next: Record<string, unknown> = {
    ...existing,
    sourceTag: "industry-inventory-fred-seed",
    source: seed.source,
    sourceUpdateNote: seed.sourceUpdateNote,
    countryCode: seed.countryCode,
    countryNameZh: "美国",
    displayName: seed.displayName,
    catalogCategory: usMetadataCatalogCategory({
      code: seed.code,
      fredId: seed.fredId,
      label: seed.displayName,
      legacyCategory: seed.category,
    }),
    freqLabel: seed.freqLabel,
    unit: seed.unit,
    catalogKey: `fred:${seed.fredId}`,
  };
  if (opts?.dataLastObsDateIso) {
    next.dataLastObsDateIso = opts.dataLastObsDateIso;
  }
  return next;
}

/** 本维度新 seed 的 10 条 FRED 序列 */
export const INDUSTRY_INVENTORY_FRED_SERIES: readonly IndustryInventoryFredSeedRow[] = [
  row("DGORDER", "耐用品新订单", "工业", "百万美元", "us.census.m3"),
  row("ADXTNO", "耐用品(除运输)新订单", "工业", "百万美元", "us.census.m3"),
  row("NEWORDER", "非国防资本品(除飞机)新订单", "工业", "百万美元", "us.census.m3"),
  row("AMDMUO", "耐用品未完成订单", "工业", "百万美元", "us.census.m3"),
  row("AMTMTI", "制造业库存", "工业", "百万美元", "us.census.m3"),
  row("IPMAN", "工业生产·制造业", "工业", "指数", "us.bls.industrial_production"),
  row("BUSINV", "总商业库存", "国内贸易与消费", "百万美元", "us.census.mtis"),
  row("ISRATIO", "总业务库销比", "国内贸易与消费", "比率", "us.census.mtis"),
  row("MNFCTRIRSA", "制造业库销比", "国内贸易与消费", "比率", "us.census.mtis"),
  row("MCUMFN", "制造业产能利用率", "工业", "%", "us.frb.g17_capacity"),
] as const;

/** 已入库 ISM（TE 抓取），本维度首次占用默认图槽，不重复 seed */
export const INDUSTRY_INVENTORY_ISM_REUSED: readonly {
  code: string;
  displayName: string;
  expectedReleasePackageId: string;
}[] = [
  {
    code: "ism_us_ism_headline",
    displayName: "ISM 制造业 PMI",
    expectedReleasePackageId: "us.ism.manufacturing",
  },
  {
    code: "ism_us_ism_new_orders",
    displayName: "ISM 新订单",
    expectedReleasePackageId: "us.ism.manufacturing",
  },
  {
    code: "ism_us_ism_inventories",
    displayName: "ISM 库存分项",
    expectedReleasePackageId: "us.ism.manufacturing",
  },
] as const;

export const INDUSTRY_INVENTORY_FRED_IDS = new Set(
  INDUSTRY_INVENTORY_FRED_SERIES.map((x) => x.fredId),
);

export function releaseRuleForIndustryInventoryFred(seed: IndustryInventoryFredSeedRow) {
  if (seed.scheduleKind === "calendar") {
    return defaultEconomicCalendarRule(seed.granularity);
  }
  return defaultReleaseRuleForGranularity(seed.granularity);
}
