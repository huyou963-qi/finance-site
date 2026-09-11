import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import { releaseRuleForPilot } from "./p0SeedCatalog";

export type PpiFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  freqLabel: "月";
  granularity: DataGranularity;
  unit: "指数";
  seasonalAdjustment: "SA" | "NSA";
  analysisMeasure: "mom_pct" | "yoy_pct";
};

function row(
  fredId: string,
  name: string,
  seasonalAdjustment: PpiFredSeedRow["seasonalAdjustment"],
  analysisMeasure: PpiFredSeedRow["analysisMeasure"],
): PpiFredSeedRow {
  return {
    fredId,
    code: `sched_fred_${fredId}`,
    name,
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "指数",
    seasonalAdjustment,
    analysisMeasure,
  };
}

/**
 * BLS Table A「Final Demand」完整底层指数。
 *
 * SA 指数用于环比；NSA 指数用于同比。二者必须分开，避免对 NSA 数据展示
 * 环比或把 SA 数据误写为 BLS 公布的 12-month change。
 */
export const PPI_FRED_SERIES: readonly PpiFredSeedRow[] = [
  row("PPIFIS", "PPI 最终需求（季调，环比）", "SA", "mom_pct"),
  row("WPSFD49116", "PPI 最终需求除食品、能源和贸易服务（季调，环比）", "SA", "mom_pct"),
  row("PPIDGS", "PPI 最终需求商品（季调，环比）", "SA", "mom_pct"),
  row("PPIDFS", "PPI 最终需求食品（季调，环比）", "SA", "mom_pct"),
  row("PPIDES", "PPI 最终需求能源（季调，环比）", "SA", "mom_pct"),
  row("WPSFD413", "PPI 最终需求商品除食品和能源（季调，环比）", "SA", "mom_pct"),
  row("PPIDSS", "PPI 最终需求服务（季调，环比）", "SA", "mom_pct"),
  row("PPITSS", "PPI 最终需求贸易服务（季调，环比）", "SA", "mom_pct"),
  row("PPIAWS", "PPI 最终需求运输和仓储服务（季调，环比）", "SA", "mom_pct"),
  row("PPITWS", "PPI 最终需求其他服务（季调，环比）", "SA", "mom_pct"),
  row("PPIFID", "PPI 最终需求（非季调，同比）", "NSA", "yoy_pct"),
  row("WPUFD49116", "PPI 最终需求除食品、能源和贸易服务（非季调，同比）", "NSA", "yoy_pct"),
  row("PPIFDG", "PPI 最终需求商品（非季调，同比）", "NSA", "yoy_pct"),
  row("PPIFDF", "PPI 最终需求食品（非季调，同比）", "NSA", "yoy_pct"),
  row("PPIFDE", "PPI 最终需求能源（非季调，同比）", "NSA", "yoy_pct"),
  row("WPUFD413", "PPI 最终需求商品除食品和能源（非季调，同比）", "NSA", "yoy_pct"),
  row("PPIFDS", "PPI 最终需求服务（非季调，同比）", "NSA", "yoy_pct"),
  row("PPIDTS", "PPI 最终需求贸易服务（非季调，同比）", "NSA", "yoy_pct"),
  row("PPITAW", "PPI 最终需求运输和仓储服务（非季调，同比）", "NSA", "yoy_pct"),
  row("PPITTW", "PPI 最终需求其他服务（非季调，同比）", "NSA", "yoy_pct"),
] as const;

/** PPIFIS 已由美国 CPI catalog 建立订阅，PPI 域只复用，不覆盖其元数据。 */
export const PPI_REUSED_FRED_IDS = new Set(["PPIFIS"]);

export const PPI_FRED_IDS = PPI_FRED_SERIES.map((item) => item.fredId);

export function buildPpiInstrumentMetadata(
  item: PpiFredSeedRow,
  existing?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    sourceTag: "ppi-fred-seed",
    source: "BLS/FRED",
    sourceUpdateNote: "BLS PPI 月报",
    countryCode: "US",
    countryNameZh: "美国",
    displayName: item.name,
    catalogCategory: usMetadataCatalogCategory({
      code: item.code,
      fredId: item.fredId,
      label: item.name,
      legacyCategory: "通胀驱动因子",
    }),
    freqLabel: item.freqLabel,
    unit: item.unit,
    catalogKey: `fred:${item.fredId}`,
    ppi: {
      family: "final_demand",
      seasonalAdjustment: item.seasonalAdjustment,
      intendedTransform: item.analysisMeasure,
      officialReleaseTable: "BLS PPI Table A",
    },
  };
}

export function releaseRuleForPpiFred(fredId: string, granularity: DataGranularity) {
  return releaseRuleForPilot(fredId, granularity);
}
