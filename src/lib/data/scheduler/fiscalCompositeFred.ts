import type { UsovCompositeSpec } from "./usovCompositeFred";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";

/** 财政 FRED 复合序列（worker 内多序列拉取后计算） */
export const FISCAL_COMPOSITE_FRED: Record<string, UsovCompositeSpec> = {
  /** FYFSGDA188S − FYOIGDA188S：初级赤字占 GDP % */
  fiscal_primary_deficit_gdp: { kind: "spread", a: "FYFSGDA188S", b: "FYOIGDA188S" },
  /** FYOIGDA188S / FYONGDA188S × 100：利息占净支出 %（年频 OMB 代理） */
  fiscal_interest_share_outlays_annual: {
    kind: "ratio",
    num: "FYOIGDA188S",
    den: "FYONGDA188S",
  },
};

export function fiscalCompositeSpec(instrumentCode: string): UsovCompositeSpec | null {
  return FISCAL_COMPOSITE_FRED[instrumentCode] ?? null;
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

export const FISCAL_COMPOSITE_SERIES: readonly FiscalCompositeSeedRow[] = [
  {
    code: "fiscal_primary_deficit_gdp",
    roleId: "us-primary-deficit-gdp",
    name: "联邦初级赤字/GDP %",
    displayName: "联邦初级赤字/GDP %",
    freqLabel: "年",
    granularity: "ANNUAL",
    unit: "%",
    sourceUpdateNote: "FRED 复合：FYFSGDA188S − FYOIGDA188S（同日期 spread）",
  },
  {
    code: "fiscal_interest_share_outlays_annual",
    roleId: "us-outlays-net-interest-share-annual",
    name: "净利息占联邦净支出比例（年）",
    displayName: "净利息占联邦净支出比例（年）",
    freqLabel: "年",
    granularity: "ANNUAL",
    unit: "比率",
    sourceUpdateNote: "FRED 复合：FYOIGDA188S / FYONGDA188S（OMB 年频；非 MTS 现金月频）",
  },
] as const;

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
