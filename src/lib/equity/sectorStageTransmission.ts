import { prisma } from "@/lib/prisma";
import {
  BENCHMARK_ETF,
  GICS_SECTOR_DEFS,
  type GicsSector,
  sectorSlug,
} from "@/lib/equity/gicsCatalog";
import {
  SECTOR_HISTORICAL_PERIODS,
  type SectorHistoricalPeriod,
} from "@/lib/equity/sectorHistoricalPeriods";
import { STYLE_BUCKETS, styleForSector, type StyleBucketId } from "@/lib/equity/styleBuckets";
import {
  CORE_FUNDAMENTAL_FACTOR_KEYS,
  scoreStageAttribution,
  type SectorAttribution,
  type StageMetricSnapshot,
  type TheoryValidation,
} from "@/lib/equity/sectorStageAttribution";
import {
  computeSectorReturnBridge,
  loadCapWeightedSnapshots,
  type CapWeightedSectorSnapshot,
  type SectorReturnBridge,
} from "@/lib/equity/sectorStageCapWeighted";
import {
  combineHistoricalFactGates,
  loadSectorHistoricalFactGates,
  type FactLayerGate,
  type SectorHistoricalFactGate,
} from "@/lib/equity/sectorHistoricalFactGates";
import {
  computeStrictEtfReturnBridge,
  loadStrictEtfSectorSnapshots,
  type StrictEtfSectorSnapshot,
} from "@/lib/equity/sectorStrictHistorical";
import { listStoredRegimes, type StoredRegime } from "@/lib/quant/macroRegime";
import {
  loadSectorFactorAggregates,
  resolveSectorFactorDate,
  type SectorFactorAggregateRow,
} from "@/lib/quant/sectorFactorData";
import { getDailyCloseRowsDbOnly, type DailyCloseDbRow } from "@/lib/equity/equityPriceStore";

export const SECTOR_TRANSMISSION_DEFINITIONS_VERSION = "2026-08-13.d3";

export const TRANSMISSION_FACTOR_KEYS = [
  "revenueYoY",
  "revenueAccel",
  "epsYoY",
  "grossMargin",
  "opMargin",
  "roeTtm",
  "ocfToNetIncome",
  "accrualsToAssets",
  "debtToAssets",
  "earningsYield",
  "salesYield",
  "fcfYield",
  "ocfToEv",
  "dividendYield",
  "bookYield",
] as const;

export type TransmissionFactorKey = (typeof TRANSMISSION_FACTOR_KEYS)[number];
export type SectorTransmissionMode = "asOf" | "realized";
export type SectorAggregationMode = "median" | "capWeighted";

export type DataQuality = {
  overall: "A" | "B" | "C" | "D" | "macro-only";
  fundamentalCoverage: number | null;
  vintageMode: "latest-restated-asof-visible" | "strict-filing-vintage" | "none";
  classificationMode: "current-gics-approx" | "historical-gics" | "none";
  aggregationMode: "median" | "cap-weighted";
  weightMode: "historical-etf-holdings" | "market-cap-proxy" | "none";
  strictPipelineApplied: boolean;
  factLayers: {
    filingVintage: FactLayerGate;
    historicalClassification: FactLayerGate;
    etfHoldings: FactLayerGate;
  } | null;
  warnings: string[];
};

export type SectorMarketResult = {
  absoluteReturn: number | null;
  priceReturn: number | null;
  excessVsSpy: number | null;
  maxDrawdown: number | null;
};

export type StrictPipelineAudit = {
  eligible: boolean;
  applied: boolean;
  activeMethod: "median" | "market-cap-proxy" | "historical-etf-holdings";
  fallbackReason: string | null;
  holdingSnapshotStart: string | null;
  holdingSnapshotEnd: string | null;
  latestFilingDateStart: string | null;
  latestFilingDateEnd: string | null;
  metricDeltaVsD1: Record<"revenueYoY" | "epsYoY" | "opMargin" | "earningsYield", number | null>;
  bridgeResidual: {
    d1: number | null;
    strict: number | null;
    delta: number | null;
  };
};

export type SectorStageTransmissionRow = {
  sector: GicsSector;
  slug: string;
  nameZh: string;
  etf: string;
  style: StyleBucketId;
  expectedLeader: boolean;
  fundamentals: Record<TransmissionFactorKey, StageMetricSnapshot>;
  market: SectorMarketResult;
  returnBridge: SectorReturnBridge | null;
  strictAudit: StrictPipelineAudit;
  attribution: SectorAttribution;
  theoryValidation: TheoryValidation;
  quality: DataQuality;
};

export type SectorStageTransmissionResponse = {
  stage: {
    id: string;
    label: string;
    start: string;
    end: string;
    t0: string | null;
    t1: string | null;
    t2: string | null;
    open: boolean;
  };
  mode: SectorTransmissionMode;
  aggregation: SectorAggregationMode;
  macro: {
    summary: { growth: string; inflation: string; policy: string; credit: string };
    regimePath: Array<{
      date: string;
      regime: string;
      dalioRegime: string | null;
      growthState: string;
      growthDirection: string | null;
      inflationState: string;
      recession: number;
    }>;
    composition: Record<string, { months: number; share: number }>;
    transitions: number;
  };
  benchmark: {
    etf: "SPY";
    return: number | null;
    startTradeDate: string | null;
    endTradeDate: string | null;
  };
  sectors: SectorStageTransmissionRow[];
  quality: DataQuality;
  definitionsVersion: string;
};

type FactorAggregateRow = SectorFactorAggregateRow;
type PriceRow = DailyCloseDbRow;

export type DatedValue = { date: string; value: number };

type MarketPathStats = {
  absoluteReturn: number | null;
  maxDrawdown: number | null;
  startTradeDate: string | null;
  endTradeDate: string | null;
};

type RegimeSummary = {
  composition: Record<string, { months: number; share: number }>;
  transitions: number;
};

const DAY_MS = 86_400_000;
const REALIZED_CONFIRMATION_DAYS = 120;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DATA_VERSION_TTL_MS = 5_000;
const responseCache = new Map<
  string,
  { expiresAt: number; value: SectorStageTransmissionResponse }
>();
let dataVersionCache: { expiresAt: number; value: string } | null = null;

/** 验收/运维工具显式清空进程内响应缓存；业务请求不调用。 */
export function clearSectorStageTransmissionCache(): void {
  responseCache.clear();
  dataVersionCache = null;
}

export class SectorStageTransmissionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SectorStageTransmissionError";
  }
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
  return iso(new Date(utcDate(dateIso).getTime() + days * DAY_MS));
}

function average(values: readonly number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function emptyMetric(): StageMetricSnapshot {
  return {
    start: null,
    end: null,
    delta: null,
    p25Start: null,
    p75Start: null,
    p25End: null,
    p75End: null,
    coverageStart: null,
    coverageEnd: null,
    sampleStart: null,
    sampleEnd: null,
  };
}

function emptyFundamentals(): Record<TransmissionFactorKey, StageMetricSnapshot> {
  return Object.fromEntries(
    TRANSMISSION_FACTOR_KEYS.map((factorKey) => [factorKey, emptyMetric()]),
  ) as Record<TransmissionFactorKey, StageMetricSnapshot>;
}

/** 纯函数：阶段内首尾总收益、峰谷最大回撤和实际交易日。 */
export function computeMarketPathStats(points: readonly DatedValue[]): MarketPathStats {
  const sorted = points
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) {
    return {
      absoluteReturn: null,
      maxDrawdown: null,
      startTradeDate: null,
      endTradeDate: null,
    };
  }

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  let peak = first.value;
  let maxDrawdown = 0;
  for (const point of sorted) {
    peak = Math.max(peak, point.value);
    maxDrawdown = Math.min(maxDrawdown, point.value / peak - 1);
  }

  return {
    absoluteReturn: last.value / first.value - 1,
    maxDrawdown,
    startTradeDate: first.date,
    endTradeDate: last.date,
  };
}

/** 纯函数：优先按 Dalio 象限统计；缺失时明确归入 unknown，不偷换为另一套 regime。 */
export function summarizeRegimePath(path: readonly StoredRegime[]): RegimeSummary {
  const counts = new Map<string, number>();
  let transitions = 0;
  let previous: string | null = null;
  for (const point of path) {
    const key = point.dalioRegime ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (previous != null && previous !== key) transitions += 1;
    previous = key;
  }

  const composition: RegimeSummary["composition"] = {};
  for (const [key, months] of counts) {
    composition[key] = { months, share: path.length ? months / path.length : 0 };
  }
  return { composition, transitions };
}

function buildMetricSnapshot(
  start: FactorAggregateRow | undefined,
  end: FactorAggregateRow | undefined,
): StageMetricSnapshot {
  const startValue = start?.median ?? null;
  const endValue = end?.median ?? null;
  return {
    start: startValue,
    end: endValue,
    delta: startValue != null && endValue != null ? endValue - startValue : null,
    p25Start: start?.p25 ?? null,
    p75Start: start?.p75 ?? null,
    p25End: end?.p25 ?? null,
    p75End: end?.p75 ?? null,
    coverageStart: start?.coverage ?? null,
    coverageEnd: end?.coverage ?? null,
    sampleStart: start?.sampleCount ?? null,
    sampleEnd: end?.sampleCount ?? null,
  };
}

function buildSectorFundamentals(
  sector: GicsSector,
  rows: readonly FactorAggregateRow[],
  t0: string | null,
  endSnapshotDate: string | null,
): Record<TransmissionFactorKey, StageMetricSnapshot> {
  if (!t0 || !endSnapshotDate) return emptyFundamentals();
  const byKeyDate = new Map(
    rows
      .filter((row) => row.sector === sector)
      .map((row) => [`${row.factorKey}|${iso(row.date)}`, row]),
  );
  return Object.fromEntries(
    TRANSMISSION_FACTOR_KEYS.map((factorKey) => [
      factorKey,
      buildMetricSnapshot(
        byKeyDate.get(`${factorKey}|${t0}`),
        byKeyDate.get(`${factorKey}|${endSnapshotDate}`),
      ),
    ]),
  ) as Record<TransmissionFactorKey, StageMetricSnapshot>;
}

function buildCapWeightedMetricSnapshot(
  start: CapWeightedSectorSnapshot | undefined,
  end: CapWeightedSectorSnapshot | undefined,
  factorKey: TransmissionFactorKey,
): StageMetricSnapshot {
  const startMetric = start?.metrics[factorKey];
  const endMetric = end?.metrics[factorKey];
  const startValue = startMetric?.value ?? null;
  const endValue = endMetric?.value ?? null;
  return {
    start: startValue,
    end: endValue,
    delta: startValue != null && endValue != null ? endValue - startValue : null,
    p25Start: null,
    p75Start: null,
    p25End: null,
    p75End: null,
    coverageStart: startMetric?.coverage ?? null,
    coverageEnd: endMetric?.coverage ?? null,
    sampleStart: startMetric?.sampleCount ?? null,
    sampleEnd: endMetric?.sampleCount ?? null,
  };
}

function buildCapWeightedFundamentals(
  sector: GicsSector,
  start: ReadonlyMap<GicsSector, CapWeightedSectorSnapshot | StrictEtfSectorSnapshot> | null,
  end: ReadonlyMap<GicsSector, CapWeightedSectorSnapshot | StrictEtfSectorSnapshot> | null,
): Record<TransmissionFactorKey, StageMetricSnapshot> {
  if (!start || !end) return emptyFundamentals();
  const startSnapshot = start.get(sector);
  const endSnapshot = end.get(sector);
  return Object.fromEntries(
    TRANSMISSION_FACTOR_KEYS.map((factorKey) => [
      factorKey,
      buildCapWeightedMetricSnapshot(startSnapshot, endSnapshot, factorKey),
    ]),
  ) as Record<TransmissionFactorKey, StageMetricSnapshot>;
}

const STRICT_AUDIT_FACTOR_KEYS = [
  "revenueYoY",
  "epsYoY",
  "opMargin",
  "earningsYield",
] as const;

function strictMetricDeltaVsD1(
  strict: Record<TransmissionFactorKey, StageMetricSnapshot> | null,
  d1: Record<TransmissionFactorKey, StageMetricSnapshot> | null,
): StrictPipelineAudit["metricDeltaVsD1"] {
  return Object.fromEntries(STRICT_AUDIT_FACTOR_KEYS.map((factorKey) => {
    const strictDelta = strict?.[factorKey].delta ?? null;
    const d1Delta = d1?.[factorKey].delta ?? null;
    return [factorKey, strictDelta != null && d1Delta != null ? strictDelta - d1Delta : null];
  })) as StrictPipelineAudit["metricDeltaVsD1"];
}

function coreCoverage(
  fundamentals: Record<TransmissionFactorKey, StageMetricSnapshot>,
): number | null {
  const known = CORE_FUNDAMENTAL_FACTOR_KEYS.some((factorKey) => {
    const metric = fundamentals[factorKey];
    return metric.coverageStart != null || metric.coverageEnd != null;
  });
  if (!known) return null;
  return average(
    CORE_FUNDAMENTAL_FACTOR_KEYS.map((factorKey) => {
      const metric = fundamentals[factorKey];
      if (metric.coverageStart == null || metric.coverageEnd == null) return 0;
      return Math.min(metric.coverageStart, metric.coverageEnd);
    }),
  );
}

function qualityGrade(
  startDate: string,
  coverage: number | null,
  strictFacts: boolean,
): DataQuality["overall"] {
  if (startDate < "2010-01-01" || coverage == null) return "macro-only";
  if (strictFacts && coverage >= 0.8) return "A";
  if (startDate < "2012-01-01" || coverage < 0.75) return "D";
  if (startDate >= "2018-01-01" && coverage >= 0.9) return "B";
  return "C";
}

function makeQuality(input: {
  startDate: string;
  coverage: number | null;
  mode: SectorTransmissionMode;
  aggregation: SectorAggregationMode;
  macroAvailable: boolean;
  marketAvailable: boolean;
  factGate?: SectorHistoricalFactGate | null;
  strictPipelineApplied?: boolean;
  extraWarnings?: readonly string[];
}): DataQuality {
  const strictFacts = Boolean(input.strictPipelineApplied && input.factGate?.strict);
  const overall = qualityGrade(input.startDate, input.coverage, strictFacts);
  const hasFundamentals = overall !== "macro-only";
  const warnings = new Set<string>(input.extraWarnings ?? []);
  if (hasFundamentals) {
    for (const warning of input.factGate?.warnings ?? []) warnings.add(warning);
    if (strictFacts) {
      warnings.add("三层历史事实已实际进入计算：财报按 filing vintage 回放、分类按 GICS 有效期命中、指标按 ETF 首尾持仓加权。");
    } else if (input.factGate?.strict) {
      warnings.add("三层历史事实虽通过覆盖闸门，但严格端点重建未完整产出；本行业整条回退到 D1 近似口径，未混用两套数据。");
    }
    if (input.aggregation === "median") {
      warnings.add("公司中位数用于解释典型公司，不等同于市值加权 ETF 的精确收益归因。");
    } else {
      if (!strictFacts) {
        warnings.add("行业总量当前仍使用公司市值代理；只有首尾 ETF 持仓闸门通过后才可切换为历史持仓口径。");
      }
      warnings.add("营收同比、盈利同比和利润率为加权公司指标；只有收益率因子乘市值后的盈利、营收与 FCF 属于可加总行业流量。");
    }
  } else {
    warnings.add("该阶段早于有效公司基本面覆盖，只允许宏观、Regime 与 ETF 收益复盘。");
  }
  if (input.coverage != null && input.coverage < 0.6) {
    warnings.add("核心基本面覆盖率低于 60%，不生成强归因结论。");
  }
  if (input.mode === "realized") {
    warnings.add("realized 模式包含阶段结束后的财报确认，只能用于后验复盘，不能用于事前判断。");
  }
  if (!input.macroAvailable) warnings.add("该阶段没有可用的月度 MacroRegime 路径。");
  if (!input.marketAvailable) warnings.add("该行业 ETF 在阶段内缺少至少两个交易日，收益与回撤为空。");

  return {
    overall,
    fundamentalCoverage: input.coverage,
    vintageMode: hasFundamentals
      ? strictFacts ? "strict-filing-vintage" : "latest-restated-asof-visible"
      : "none",
    classificationMode: hasFundamentals
      ? strictFacts ? "historical-gics" : "current-gics-approx"
      : "none",
    aggregationMode: input.aggregation === "capWeighted" ? "cap-weighted" : "median",
    weightMode: hasFundamentals
      ? strictFacts ? "historical-etf-holdings" : "market-cap-proxy"
      : "none",
    strictPipelineApplied: strictFacts,
    factLayers: input.factGate
      ? {
          filingVintage: input.factGate.filingVintage,
          historicalClassification: input.factGate.historicalClassification,
          etfHoldings: input.factGate.etfHoldings,
        }
      : null,
    warnings: [...warnings],
  };
}

function stageById(stageId: string): SectorHistoricalPeriod | null {
  return SECTOR_HISTORICAL_PERIODS.find((stage) => stage.id === stageId) ?? null;
}

async function loadDataVersion(): Promise<string> {
  if (dataVersionCache && dataVersionCache.expiresAt > Date.now()) {
    return dataVersionCache.value;
  }
  const [sectorFactor, companyFactor, regime, price, vintage, classification, holdings] = await Promise.all([
    prisma.factorSectorSnapshot.aggregate({ _max: { date: true } }),
    prisma.factorSnapshot.aggregate({ _max: { date: true } }),
    prisma.macroRegime.aggregate({ _max: { date: true } }),
    prisma.equityDailyBar.aggregate({
      where: { symbol: { in: [BENCHMARK_ETF, ...GICS_SECTOR_DEFS.map((def) => def.etf)] } },
      _max: { date: true },
    }),
    prisma.equityFundamentalVintage.aggregate({ _max: { filedAt: true } }),
    prisma.equitySectorClassificationHistory.aggregate({ _max: { validFrom: true } }),
    prisma.sectorEtfHolding.aggregate({ _max: { asOfDate: true } }),
  ]);
  const value = [
    sectorFactor._max.date,
    companyFactor._max.date,
    regime._max.date,
    price._max.date,
    vintage._max.filedAt,
    classification._max.validFrom,
    holdings._max.asOfDate,
  ]
    .map((date) => (date ? iso(date) : "none"))
    .join("|");
  dataVersionCache = { expiresAt: Date.now() + DATA_VERSION_TTL_MS, value };
  return value;
}

async function loadStageTransmission(
  stage: SectorHistoricalPeriod,
  mode: SectorTransmissionMode,
  aggregation: SectorAggregationMode,
): Promise<SectorStageTransmissionResponse> {
  const today = todayIso();
  const open = stage.end > today;
  const effectiveEndBoundary = open ? today : stage.end;

  const [t0, t1, regimes, prices] = await Promise.all([
    resolveSectorFactorDate(stage.start),
    resolveSectorFactorDate(effectiveEndBoundary),
    listStoredRegimes({ start: stage.start, end: effectiveEndBoundary }),
    getDailyCloseRowsDbOnly({
      symbols: [BENCHMARK_ETF, ...GICS_SECTOR_DEFS.map((def) => def.etf)],
      from: utcDate(stage.start),
      to: utcDate(effectiveEndBoundary),
    }),
  ]);

  const t2 = t1
    ? await resolveSectorFactorDate(addDays(t1, REALIZED_CONFIRMATION_DAYS))
    : null;
  const fundamentalEndDate = mode === "realized" ? t2 : t1;
  const snapshotDates = [t0, fundamentalEndDate].filter((date): date is string => Boolean(date));
  const factorRows: FactorAggregateRow[] = aggregation === "median" && snapshotDates.length
    ? await loadSectorFactorAggregates({
        dates: snapshotDates,
        factorKeys: TRANSMISSION_FACTOR_KEYS,
        sectors: GICS_SECTOR_DEFS.map((def) => def.sector),
      })
    : [];
  const canBuildCapWeighted =
    aggregation === "capWeighted" &&
    t0 != null &&
    fundamentalEndDate != null &&
    t0 >= "2010-01-01";
  const [capWeightedPair, factGates] = await Promise.all([
    canBuildCapWeighted
      ? Promise.all([
          loadCapWeightedSnapshots(t0),
          loadCapWeightedSnapshots(fundamentalEndDate),
        ])
      : Promise.resolve([null, null] as const),
    loadSectorHistoricalFactGates(t0, fundamentalEndDate),
  ]);
  const [capWeightedStart, capWeightedEnd] = capWeightedPair;
  const strictSectors = [...factGates.values()]
    .filter((gate) => gate.strict)
    .map((gate) => gate.sector);
  const strictPair = canBuildCapWeighted && strictSectors.length && t0 && fundamentalEndDate
    ? await Promise.all([
        loadStrictEtfSectorSnapshots(t0, strictSectors),
        loadStrictEtfSectorSnapshots(fundamentalEndDate, strictSectors),
      ])
    : [null, null] as const;
  const [strictStart, strictEnd] = strictPair;

  const regimePath: StoredRegime[] = regimes;
  const macroSummary = summarizeRegimePath(regimePath);

  const pathsBySymbol = new Map<string, DatedValue[]>();
  const pricePathsBySymbol = new Map<string, DatedValue[]>();
  for (const row of prices as PriceRow[]) {
    const list = pathsBySymbol.get(row.symbol) ?? [];
    list.push({ date: iso(row.date), value: row.adjClose });
    pathsBySymbol.set(row.symbol, list);
    const priceList = pricePathsBySymbol.get(row.symbol) ?? [];
    priceList.push({ date: iso(row.date), value: row.close });
    pricePathsBySymbol.set(row.symbol, priceList);
  }
  const benchmarkStats = computeMarketPathStats(pathsBySymbol.get(BENCHMARK_ETF) ?? []);

  const baseRows = STYLE_BUCKETS.flatMap((bucket) =>
    bucket.sectors.map((sector) => {
      const def = GICS_SECTOR_DEFS.find((item) => item.sector === sector)!;
      const marketStats = computeMarketPathStats(pathsBySymbol.get(def.etf) ?? []);
      const priceStats = computeMarketPathStats(pricePathsBySymbol.get(def.etf) ?? []);
      const factGate = factGates.get(sector) ?? null;
      const strictStartSnapshot = strictStart?.get(sector) ?? null;
      const strictEndSnapshot = strictEnd?.get(sector) ?? null;
      const strictPipelineApplied = Boolean(
        aggregation === "capWeighted" &&
        factGate?.strict &&
        strictStartSnapshot &&
        strictEndSnapshot,
      );
      const d1Fundamentals = aggregation === "capWeighted"
        ? buildCapWeightedFundamentals(sector, capWeightedStart, capWeightedEnd)
        : null;
      const strictFundamentals = strictPipelineApplied
        ? buildCapWeightedFundamentals(sector, strictStart, strictEnd)
        : null;
      const fundamentals = aggregation === "capWeighted"
        ? strictFundamentals ?? d1Fundamentals!
        : buildSectorFundamentals(sector, factorRows, t0, fundamentalEndDate);
      const absoluteReturn = marketStats.absoluteReturn;
      return {
        sector,
        def,
        fundamentals,
        marketStats,
        priceStats,
        factGate,
        strictPipelineApplied,
        strictStartSnapshot,
        strictEndSnapshot,
        d1Fundamentals,
        strictFundamentals,
        absoluteReturn,
        excessVsSpy:
          absoluteReturn != null && benchmarkStats.absoluteReturn != null
            ? absoluteReturn - benchmarkStats.absoluteReturn
            : null,
        expectedLeader: stage.expectedLeaders.includes(def.nameZh),
      };
    }),
  );

  const attributionBySector = new Map(
    scoreStageAttribution(
      baseRows.map((row) => ({
        sector: row.sector,
        style: styleForSector(row.sector),
        expectedLeader: row.expectedLeader,
        fundamentals: row.fundamentals,
        absoluteReturn: row.absoluteReturn,
        excessVsSpy: row.excessVsSpy,
      })),
    ).map((row) => [row.sector, row]),
  );

  const sectors: SectorStageTransmissionRow[] = baseRows.map((row) => {
    const coverage = coreCoverage(row.fundamentals);
    const scored = attributionBySector.get(row.sector)!;
    const d1Bridge = aggregation === "capWeighted"
      ? computeSectorReturnBridge({
          totalReturn: row.absoluteReturn,
          priceReturn: row.priceStats.absoluteReturn,
          start: capWeightedStart?.get(row.sector) ?? null,
          end: capWeightedEnd?.get(row.sector) ?? null,
        })
      : null;
    const strictBridge = row.strictPipelineApplied
      ? computeStrictEtfReturnBridge({
          totalReturn: row.absoluteReturn,
          priceReturn: row.priceStats.absoluteReturn,
          start: row.strictStartSnapshot,
          end: row.strictEndSnapshot,
        })
      : null;
    const residualDelta = d1Bridge?.residual != null && strictBridge?.residual != null
      ? strictBridge.residual - d1Bridge.residual
      : null;
    return {
      sector: row.sector,
      slug: sectorSlug(row.sector),
      nameZh: row.def.nameZh,
      etf: row.def.etf,
      style: styleForSector(row.sector),
      expectedLeader: row.expectedLeader,
      fundamentals: row.fundamentals,
      market: {
        absoluteReturn: row.absoluteReturn,
        priceReturn: row.priceStats.absoluteReturn,
        excessVsSpy: row.excessVsSpy,
        maxDrawdown: row.marketStats.maxDrawdown,
      },
      returnBridge: strictBridge ?? d1Bridge,
      strictAudit: {
        eligible: Boolean(row.factGate?.strict),
        applied: row.strictPipelineApplied,
        activeMethod: aggregation === "median"
          ? "median"
          : row.strictPipelineApplied ? "historical-etf-holdings" : "market-cap-proxy",
        fallbackReason: aggregation !== "capWeighted" || row.strictPipelineApplied
          ? null
          : row.factGate?.strict
            ? "strict-endpoint-rebuild-incomplete"
            : "three-layer-fact-gate-not-passed",
        holdingSnapshotStart: row.strictStartSnapshot?.holdingAsOfDate ?? null,
        holdingSnapshotEnd: row.strictEndSnapshot?.holdingAsOfDate ?? null,
        latestFilingDateStart: row.strictStartSnapshot?.latestFilingDateUsed ?? null,
        latestFilingDateEnd: row.strictEndSnapshot?.latestFilingDateUsed ?? null,
        metricDeltaVsD1: strictMetricDeltaVsD1(row.strictFundamentals, row.d1Fundamentals),
        bridgeResidual: {
          d1: d1Bridge?.residual ?? null,
          strict: strictBridge?.residual ?? null,
          delta: residualDelta,
        },
      },
      attribution: scored.attribution,
      theoryValidation: scored.theoryValidation,
      quality: makeQuality({
        startDate: t0 ?? stage.start,
        coverage,
        mode,
        aggregation,
        macroAvailable: regimePath.length > 0,
        marketAvailable: row.absoluteReturn != null,
        factGate: row.factGate,
        strictPipelineApplied: row.strictPipelineApplied,
      }),
    };
  });

  const coverage = average(
    sectors
      .map((row) => row.quality.fundamentalCoverage)
      .filter((value): value is number => value != null),
  );
  const effectiveEnd = open
    ? benchmarkStats.endTradeDate ?? effectiveEndBoundary
    : stage.end;
  const combinedFactGate = combineHistoricalFactGates([...factGates.values()]);
  const allSectorsStrict = aggregation === "capWeighted" &&
    sectors.length > 0 &&
    sectors.every((row) => row.quality.strictPipelineApplied);

  return {
    stage: {
      id: stage.id,
      label: stage.label,
      start: stage.start,
      end: effectiveEnd,
      t0,
      t1,
      t2,
      open,
    },
    mode,
    aggregation,
    macro: {
      summary: { ...stage.regime },
      regimePath: regimePath.map(({ inputs: _inputs, ...point }) => point),
      composition: macroSummary.composition,
      transitions: macroSummary.transitions,
    },
    benchmark: {
      etf: BENCHMARK_ETF,
      return: benchmarkStats.absoluteReturn,
      startTradeDate: benchmarkStats.startTradeDate,
      endTradeDate: benchmarkStats.endTradeDate,
    },
    sectors,
    quality: makeQuality({
      startDate: t0 ?? stage.start,
      coverage,
      mode,
      aggregation,
      macroAvailable: regimePath.length > 0,
      marketAvailable: benchmarkStats.absoluteReturn != null,
      factGate: combinedFactGate,
      strictPipelineApplied: allSectorsStrict,
    }),
    definitionsVersion: SECTOR_TRANSMISSION_DEFINITIONS_VERSION,
  };
}

export function isSectorTransmissionMode(value: string): value is SectorTransmissionMode {
  return value === "asOf" || value === "realized";
}

export function isSectorAggregationMode(value: string): value is SectorAggregationMode {
  return value === "median" || value === "capWeighted";
}

export async function getSectorStageTransmission(
  stageId: string,
  mode: SectorTransmissionMode = "asOf",
  aggregation: SectorAggregationMode = "median",
): Promise<SectorStageTransmissionResponse> {
  const stage = stageById(stageId);
  if (!stage) {
    throw new SectorStageTransmissionError("历史阶段不存在", "STAGE_NOT_FOUND", 404);
  }

  const dataVersion = await loadDataVersion();
  const cacheKey = [stage.id, mode, aggregation, SECTOR_TRANSMISSION_DEFINITIONS_VERSION, dataVersion].join("|");
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await loadStageTransmission(stage, mode, aggregation);
  responseCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  if (responseCache.size > 24) {
    for (const [key, entry] of responseCache) {
      if (entry.expiresAt <= Date.now() || key !== cacheKey) responseCache.delete(key);
      if (responseCache.size <= 12) break;
    }
  }
  return value;
}
