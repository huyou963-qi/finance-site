import type { UsovCompositeSpec } from "./usovCompositeFred";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";

/** 财政 FRED 复合序列（worker 内多序列拉取后计算） */
/**
 * 宏观数据库约束：库内不存二次计算指标。原初级赤字/GDP、利息占净支出（年）已退役，
 * 初级赤字改在财政模板「指标运算」中由 FYFSGDA188S − FYOIGDA188S 计算。勿再新增。
 */
export const FISCAL_COMPOSITE_FRED: Record<string, UsovCompositeSpec> = {};

export function fiscalCompositeSpec(instrumentCode: string): UsovCompositeSpec | null {
  return FISCAL_COMPOSITE_FRED[instrumentCode] ?? null;
}

/**
 * 复合指标本身没有单一 FRED series id；保留其计算所依赖的上游序列，供调度审计与告警展示。
 */
export function fiscalCompositeFredIds(spec: UsovCompositeSpec): string[] {
  // UsovCompositeSpec 有四个变体；漏掉 wow_* 会在运行时返回 [undefined, undefined]。
  // 用穷尽 switch，将来再加变体时由类型检查强制在此补齐。
  switch (spec.kind) {
    case "spread":
      return [spec.a, spec.b];
    case "ratio":
      return [spec.num, spec.den];
    case "wow_pct":
    case "wow_ma4":
      return [spec.series];
  }
}

export type FiscalCompositeSeedRow = {
  code: string;
  roleId: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: "ANNUAL";
  unit: string;
  sourceUpdateNote: string;
};

export const FISCAL_COMPOSITE_SERIES: readonly FiscalCompositeSeedRow[] = [];

export function buildFiscalCompositeInstrumentMetadata(
  row: FiscalCompositeSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const spec = FISCAL_COMPOSITE_FRED[row.code];
  return {
    ...(opts?.existing ?? {}),
    sourceTag: "fiscal-composite-fred-seed",
    source: "OMB/FRED",
    sourceUpdateNote: row.sourceUpdateNote,
    countryCode: "US",
    countryNameZh: "美国",
    displayName: row.displayName,
    catalogCategory: usMetadataCatalogCategory({
      code: row.code,
      label: row.displayName,
      legacyCategory: "财政",
    }),
    freqLabel: row.freqLabel,
    unit: row.unit,
    catalogKey: `fiscal:${row.code}`,
    roleId: row.roleId,
    compositeSpec: spec,
    upstreamFredSeriesIds: fiscalCompositeFredIds(spec),
    fetchAcquisition: {
      status: "known",
      probedAt: new Date().toISOString(),
      method: "fred_composite",
      methodLabel: "FRED API 复合计算",
      officialUrl: "https://fred.stlouisfed.org/",
      message: row.sourceUpdateNote,
    },
  };
}
