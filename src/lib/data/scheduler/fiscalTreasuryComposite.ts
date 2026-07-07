import { fetchTreasuryFiscalIncremental } from "./adapters/treasuryFiscalDataAdapter";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import { treasurySourceSeriesKey, TREASURY_FISCAL_SERIES } from "./treasuryFiscalSeedCatalog";
import type { FetchIncrementalResult, ObservationPoint } from "./types";

export type TreasuryCompositeSpec =
  | { kind: "ratio"; numCode: string; denCode: string; scalePercent?: boolean }
  | { kind: "ratio_sum"; numCodes: string[]; denCode: string; scalePercent?: boolean };

export const FISCAL_TREASURY_COMPOSITE: Record<string, TreasuryCompositeSpec> = {
  fiscal_individual_tax_share_receipts: {
    kind: "ratio",
    numCode: "treasury_mts_m09_rcpt_individual",
    denCode: "treasury_mts_m01_receipts",
    scalePercent: true,
  },
  fiscal_net_interest_share_outlays: {
    kind: "ratio",
    numCode: "treasury_mts_m09_outlay_interest",
    denCode: "treasury_mts_m01_outlays",
    scalePercent: true,
  },
  fiscal_ss_medicare_share_outlays: {
    kind: "ratio_sum",
    numCodes: ["treasury_mts_m09_outlay_social_security", "treasury_mts_m09_outlay_medicare"],
    denCode: "treasury_mts_m01_outlays",
    scalePercent: true,
  },
};

export function fiscalTreasuryCompositeSpec(instrumentCode: string): TreasuryCompositeSpec | null {
  return FISCAL_TREASURY_COMPOSITE[instrumentCode] ?? null;
}

export type FiscalTreasuryCompositeSeedRow = {
  code: string;
  roleId: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: "MONTHLY";
  unit: string;
  sourceUpdateNote: string;
};

export const FISCAL_TREASURY_COMPOSITE_SERIES: readonly FiscalTreasuryCompositeSeedRow[] = [
  {
    code: "fiscal_individual_tax_share_receipts",
    roleId: "us-receipts-individual-share",
    name: "个人所得税占联邦收入比例（月）",
    displayName: "个人所得税占联邦收入比例（月）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "%",
    sourceUpdateNote: "Treasury 复合：MTS Table 9 个税 / Table 1 总收入 × 100",
  },
  {
    code: "fiscal_net_interest_share_outlays",
    roleId: "us-outlays-net-interest-share",
    name: "净利息占联邦支出比例（月）",
    displayName: "净利息占联邦支出比例（月）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "%",
    sourceUpdateNote: "Treasury 复合：MTS Table 9 净利息 / Table 1 总支出 × 100",
  },
  {
    code: "fiscal_ss_medicare_share_outlays",
    roleId: "us-outlays-ss-medicare-share",
    name: "社保+医保占联邦支出比例（月）",
    displayName: "社保+医保占联邦支出比例（月）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "%",
    sourceUpdateNote:
      "Treasury 复合：(MTS Table 9 社保 + 医保) / Table 1 总支出 × 100",
  },
] as const;

function sourceKeyForInstrumentCode(code: string): string {
  const row = TREASURY_FISCAL_SERIES.find((r) => r.code === code);
  if (!row) throw new Error(`Treasury 复合未知仪器代码：${code}`);
  return treasurySourceSeriesKey(row);
}

function indexByDay(points: ObservationPoint[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of points) {
    m.set(p.obsDate.getTime(), p.value);
  }
  return m;
}

function combineRatio(
  num: ObservationPoint[],
  den: ObservationPoint[],
  scalePercent: boolean,
): ObservationPoint[] {
  const inum = indexByDay(num);
  const iden = indexByDay(den);
  const keys = [...inum.keys()].filter((k) => iden.has(k)).sort((a, b) => a - b);
  const out: ObservationPoint[] = [];
  for (const k of keys) {
    const d = iden.get(k)!;
    if (d === 0) continue;
    let v = inum.get(k)! / d;
    if (scalePercent) v *= 100;
    if (!Number.isFinite(v)) continue;
    out.push({ obsDate: new Date(k), value: v });
  }
  return out;
}

function sumSeries(seriesList: ObservationPoint[][]): ObservationPoint[] {
  if (seriesList.length === 0) return [];
  const maps = seriesList.map(indexByDay);
  const keys = [...maps[0]!.keys()];
  const common = keys.filter((k) => maps.every((m) => m.has(k))).sort((a, b) => a - b);
  return common.map((k) => ({
    obsDate: new Date(k),
    value: maps.reduce((sum, m) => sum + m.get(k)!, 0),
  }));
}

function codesForSpec(spec: TreasuryCompositeSpec): string[] {
  if (spec.kind === "ratio") return [spec.numCode, spec.denCode];
  return [...spec.numCodes, spec.denCode];
}

function applyTreasuryComposite(
  spec: TreasuryCompositeSpec,
  series: Map<string, ObservationPoint[]>,
): ObservationPoint[] {
  const scale = spec.scalePercent ?? false;
  if (spec.kind === "ratio") {
    return combineRatio(series.get(spec.numCode) ?? [], series.get(spec.denCode) ?? [], scale);
  }
  const num = sumSeries(spec.numCodes.map((c) => series.get(c) ?? []));
  return combineRatio(num, series.get(spec.denCode) ?? [], scale);
}

export async function fetchTreasuryCompositeIncremental(
  spec: TreasuryCompositeSpec,
  observationStart: string,
): Promise<FetchIncrementalResult> {
  const codes = codesForSpec(spec);
  const series = new Map<string, ObservationPoint[]>();
  let sourceLatest: Date | null = null;
  let skippedInvalid = 0;

  for (const code of codes) {
    const key = sourceKeyForInstrumentCode(code);
    const r = await fetchTreasuryFiscalIncremental(key, observationStart);
    series.set(code, r.points);
    skippedInvalid += r.skippedInvalid;
    if (r.sourceLatestObsDate && (!sourceLatest || r.sourceLatestObsDate > sourceLatest)) {
      sourceLatest = r.sourceLatestObsDate;
    }
  }

  const points = applyTreasuryComposite(spec, series);
  return { points, sourceLatestObsDate: sourceLatest, skippedInvalid };
}

export function buildFiscalTreasuryCompositeInstrumentMetadata(
  row: FiscalTreasuryCompositeSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const spec = FISCAL_TREASURY_COMPOSITE[row.code];
  return {
    ...(opts?.existing ?? {}),
    sourceTag: "fiscal-treasury-composite-seed",
    source: "Treasury Fiscal Data",
    sourceUpdateNote: row.sourceUpdateNote,
    officialUrl: "https://fiscaldata.treasury.gov/",
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
      method: "treasury_composite",
      methodLabel: "Treasury Fiscal Data API 复合计算",
      officialUrl: "https://fiscaldata.treasury.gov/",
      message: row.sourceUpdateNote,
    },
  };
}
