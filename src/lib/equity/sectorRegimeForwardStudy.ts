import { prisma } from "@/lib/prisma";
import {
  GICS_SECTOR_DEFS,
  type GicsSector,
} from "@/lib/equity/gicsCatalog";
import { loadGridCloses } from "@/lib/quant/factorResearchData";
import { spearmanIC } from "@/lib/quant/factorResearch";
import { loadSectorFactorAggregates } from "@/lib/quant/sectorFactorData";
import {
  listStoredRegimes,
  type DalioQuadrant,
  type StoredRegime,
} from "@/lib/quant/macroRegime";

export const SECTOR_REGIME_FORWARD_STUDY_VERSION = "stage-f-2026-08-13-v1";
export const SECTOR_FORWARD_HORIZONS = [3, 6, 12] as const;
export const STAGE_F_TRAIN_END = "2014-12-31";
export const STAGE_F_VALIDATION_END = "2019-12-31";
export const STAGE_F_TEST_START = "2020-01-01";
export const STAGE_F_FACTOR_SIGNAL_START = "2012-01-01";

const ALL_HORIZONS = [1, ...SECTOR_FORWARD_HORIZONS] as const;
const MIN_COMPLETED_TRAIN_MONTHS = 36;
const REGIME_SHRINKAGE_MONTHS = 12;
const MIN_FACTOR_COVERAGE = 0.5;
const MIN_EVALUATION_SECTORS = 6;
const TOP_BUCKET_SIZE = 3;
const PORTFOLIO_COST_BPS = 10;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DATA_VERSION_TTL_MS = 5_000;

const VALUATION_FACTORS = [
  "earningsYield",
  "bookYield",
  "salesYield",
  "fcfYield",
] as const;
const FUNDAMENTAL_FACTORS = [
  "revenueYoY",
  "revenueAccel",
  "grossMargin",
  "opMargin",
  "roeTtm",
  "debtToAssets",
] as const;
const ALL_FACTOR_KEYS = [...VALUATION_FACTORS, ...FUNDAMENTAL_FACTORS] as const;
const INVERTED_FACTOR_KEYS = new Set<string>(["debtToAssets"]);

export type SectorForwardHorizon = (typeof SECTOR_FORWARD_HORIZONS)[number];
export type SectorForwardModelId =
  | "unconditional"
  | "regimeOnly"
  | "regimeValuation"
  | "regimeFundamental";
export type SectorForwardSplit = "train" | "validation" | "test";
export type SectorForwardVerdict = "supported" | "weak" | "unsupported" | "insufficient";

export type SectorForwardMetricSummary = {
  periods: number;
  meanIc: number | null;
  icCiLow: number | null;
  icCiHigh: number | null;
  hitRate: number | null;
  meanTop3Outcome: number | null;
  meanTopBottomSpread: number | null;
  averageSectorCount: number | null;
};

export type SectorForwardPortfolioSummary = {
  periods: number;
  annualizedReturn: number | null;
  benchmarkAnnualizedReturn: number | null;
  annualizedExcess: number | null;
  maxDrawdown: number | null;
  benchmarkMaxDrawdown: number | null;
  averageMonthlyTurnover: number | null;
  activeHitRate: number | null;
  costBps: number;
};

export type SectorForwardModelResult = {
  id: SectorForwardModelId;
  label: string;
  ingredients: string;
  horizons: Array<{
    horizonMonths: SectorForwardHorizon;
    train: SectorForwardMetricSummary;
    validation: SectorForwardMetricSummary;
    test: SectorForwardMetricSummary;
  }>;
  testPortfolio: SectorForwardPortfolioSummary;
};

export type SectorRegimeForwardStudyResponse = {
  version: string;
  generatedAt: string;
  methodology: {
    evidenceGrade: "C";
    evidenceLabel: string;
    signalTiming: string;
    trainingRule: string;
    modelSelectionRule: string;
    confidenceIntervalRule: string;
    returnTarget: string;
    fundamentalTarget: string;
    splits: {
      train: string;
      validation: string;
      test: string;
    };
  };
  sample: {
    start: string;
    end: string;
    regimeMonths: number;
    validRegimeMonths: number;
    factorStart: string | null;
    factorEnd: string | null;
    factorRows: number;
    averageFactorCoverage: number | null;
    etfAvailability: Array<{
      sector: GicsSector;
      nameZh: string;
      etf: string;
      firstMonth: string | null;
      lastMonth: string | null;
    }>;
  };
  models: SectorForwardModelResult[];
  selectedByHorizon: Array<{
    horizonMonths: SectorForwardHorizon;
    modelId: Exclude<SectorForwardModelId, "unconditional">;
    modelLabel: string;
    selectionPassed: boolean;
    selectionNote: string;
    validationMeanIc: number | null;
    test: SectorForwardMetricSummary;
    verdict: SectorForwardVerdict;
    verdictLabel: string;
  }>;
  fundamentalOutlook: Array<{
    horizonMonths: SectorForwardHorizon;
    quarterLabel: string;
    unconditional: {
      validation: SectorForwardMetricSummary;
      test: SectorForwardMetricSummary;
    };
    regimeOnly: {
      validation: SectorForwardMetricSummary;
      test: SectorForwardMetricSummary;
    };
    verdict: SectorForwardVerdict;
    verdictLabel: string;
  }>;
  current: {
    signalDate: string;
    regime: DalioQuadrant;
    status: "researchOnly";
    statusLabel: string;
    horizons: Array<{
      horizonMonths: SectorForwardHorizon;
      modelId: Exclude<SectorForwardModelId, "unconditional">;
      modelLabel: string;
      selectionPassed: boolean;
      trainingLabelCutoff: string;
      rankings: Array<{
        rank: number;
        sector: GicsSector;
        nameZh: string;
        etf: string;
        score: number;
      }>;
    }>;
  } | null;
  overallVerdict: {
    verdict: SectorForwardVerdict;
    label: string;
    summary: string;
  };
  warnings: string[];
};

type ScoreMap = Map<GicsSector, number | null>;
type TargetMap = Map<GicsSector, number>;

type FactorCell = {
  median: number;
  coverage: number;
};

type FactorPanel = Map<
  string,
  Map<GicsSector, Map<string, FactorCell>>
>;

type HorizonOutcome = {
  signalIndex: number;
  endIndex: number;
  signalDate: string;
  endDate: string;
  regime: DalioQuadrant;
  spyReturn: number;
  absoluteBySector: TargetMap;
  excessBySector: TargetMap;
};

type PeriodEvaluation = {
  date: string;
  ic: number;
  hit: boolean;
  top3Outcome: number;
  topBottomSpread: number;
  sectorCount: number;
};

type ModelScores = Record<SectorForwardModelId, ScoreMap>;

type PredictionRow = {
  date: string;
  split: SectorForwardSplit;
  scores: ModelScores;
  outcome: HorizonOutcome;
};

type FundamentalOutcome = {
  signalIndex: number;
  endIndex: number;
  signalDate: string;
  endDate: string;
  regime: DalioQuadrant;
  deltaBySector: TargetMap;
};

type FundamentalPredictionRow = {
  date: string;
  split: SectorForwardSplit;
  unconditional: ScoreMap;
  regimeOnly: ScoreMap;
  outcome: FundamentalOutcome;
};

const MODEL_META: Record<
  SectorForwardModelId,
  { label: string; ingredients: string }
> = {
  unconditional: {
    label: "无条件历史基准",
    ingredients: "各行业此前已完成标签的扩展窗口均值，不使用 Regime 或当前因子。",
  },
  regimeOnly: {
    label: "Regime",
    ingredients: "当前增长×通胀象限下的历史行业超额收益，并向无条件均值做固定强度收缩。",
  },
  regimeValuation: {
    label: "Regime + 估值",
    ingredients: "Regime 排名与当期 E/P、B/P、S/P、FCF Yield 行业截面各占 50%。",
  },
  regimeFundamental: {
    label: "Regime + 基本面",
    ingredients: "Regime 排名与当期成长、利润率、ROE、杠杆行业截面各占 50%。",
  },
};

const responseCache = new Map<
  string,
  { expiresAt: number; value: SectorRegimeForwardStudyResponse }
>();
let dataVersionCache: { expiresAt: number; value: string } | null = null;

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function finiteMean(values: readonly (number | null | undefined)[]): number | null {
  const valid = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null;
}

/** 阶段 F 的核心无前视闸门：标签终点晚于当前信号月时绝不进入估计。 */
export function expandingMeanAsOf(
  rows: readonly { endIndex: number; value: number | null }[],
  currentIndex: number,
): { mean: number | null; count: number } {
  const values = rows.flatMap((row) =>
    row.endIndex <= currentIndex && row.value != null && Number.isFinite(row.value)
      ? [row.value]
      : [],
  );
  return { mean: finiteMean(values), count: values.length };
}

/**
 * 固定样本切分带 purge：训练/验证标签必须在各自截止日前完整结束；跨边界标签剔除。
 * 测试集按信号日从 2020-01 起，避免 2019 信号的未来收益渗入模型选择。
 */
export function splitForEvaluation(
  signalDate: string,
  labelEndDate: string,
): SectorForwardSplit | null {
  if (labelEndDate <= STAGE_F_TRAIN_END) return "train";
  if (signalDate >= STAGE_F_TEST_START) return "test";
  if (
    signalDate > STAGE_F_TRAIN_END &&
    labelEndDate <= STAGE_F_VALIDATION_END
  ) {
    return "validation";
  }
  return null;
}

export function rankNormalize(values: ReadonlyMap<GicsSector, number | null>): ScoreMap {
  const valid = [...values.entries()]
    .filter((entry): entry is [GicsSector, number] =>
      entry[1] != null && Number.isFinite(entry[1]),
    )
    .sort((left, right) => left[1] - right[1]);
  const out: ScoreMap = new Map(
    GICS_SECTOR_DEFS.map((definition) => [definition.sector, null]),
  );
  if (!valid.length) return out;
  if (valid.length === 1) {
    out.set(valid[0]![0], 0);
    return out;
  }
  let index = 0;
  while (index < valid.length) {
    let end = index;
    while (end + 1 < valid.length && valid[end + 1]![1] === valid[index]![1]) end += 1;
    const averageRank = (index + end) / 2;
    const normalized = (averageRank / (valid.length - 1)) * 2 - 1;
    for (let cursor = index; cursor <= end; cursor += 1) {
      out.set(valid[cursor]![0], normalized);
    }
    index = end + 1;
  }
  return out;
}

export function neweyWestMeanInterval(
  values: readonly number[],
  lag: number,
): { mean: number | null; low: number | null; high: number | null; se: number | null } {
  const xs = values.filter(Number.isFinite);
  if (!xs.length) return { mean: null, low: null, high: null, se: null };
  const mean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  if (xs.length < 2) return { mean, low: null, high: null, se: null };
  const maxLag = Math.min(Math.max(0, Math.trunc(lag)), xs.length - 1);
  let longRunVariance = xs.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / xs.length;
  for (let offset = 1; offset <= maxLag; offset += 1) {
    let covariance = 0;
    for (let index = offset; index < xs.length; index += 1) {
      covariance += (xs[index]! - mean) * (xs[index - offset]! - mean);
    }
    covariance /= xs.length;
    const weight = 1 - offset / (maxLag + 1);
    longRunVariance += 2 * weight * covariance;
  }
  const se = Math.sqrt(Math.max(0, longRunVariance) / xs.length);
  return {
    mean,
    low: mean - 1.96 * se,
    high: mean + 1.96 * se,
    se,
  };
}

function combineScores(left: ScoreMap, right: ScoreMap): ScoreMap {
  return new Map(
    GICS_SECTOR_DEFS.map((definition) => {
      const a = left.get(definition.sector) ?? null;
      const b = right.get(definition.sector) ?? null;
      return [
        definition.sector,
        a != null && b != null ? 0.5 * a + 0.5 * b : null,
      ];
    }),
  );
}

function crossSectionComposite(
  panel: FactorPanel,
  date: string,
  factorKeys: readonly string[],
  minFactors: number,
): ScoreMap {
  if (date < STAGE_F_FACTOR_SIGNAL_START) {
    return new Map(
      GICS_SECTOR_DEFS.map((definition) => [definition.sector, null]),
    );
  }
  const bySector = panel.get(date);
  const perFactor = new Map<string, ScoreMap>();
  for (const factorKey of factorKeys) {
    const raw: ScoreMap = new Map();
    for (const definition of GICS_SECTOR_DEFS) {
      const cell = bySector?.get(definition.sector)?.get(factorKey);
      const value = cell && cell.coverage >= MIN_FACTOR_COVERAGE
        ? cell.median * (INVERTED_FACTOR_KEYS.has(factorKey) ? -1 : 1)
        : null;
      raw.set(definition.sector, value);
    }
    const validCount = [...raw.values()].filter(
      (value): value is number => value != null && Number.isFinite(value),
    ).length;
    if (validCount >= MIN_EVALUATION_SECTORS) {
      perFactor.set(factorKey, rankNormalize(raw));
    }
  }
  return new Map(
    GICS_SECTOR_DEFS.map((definition) => {
      const values = factorKeys.map(
        (factorKey) => perFactor.get(factorKey)?.get(definition.sector) ?? null,
      );
      const valid = values.filter(
        (value): value is number => value != null && Number.isFinite(value),
      );
      return [
        definition.sector,
        valid.length >= minFactors
          ? valid.reduce((sum, value) => sum + value, 0) / valid.length
          : null,
      ];
    }),
  );
}

function outcomeMean(
  outcomes: readonly { endIndex: number; regime: DalioQuadrant; target: TargetMap }[],
  currentIndex: number,
  sector: GicsSector,
  regime?: DalioQuadrant,
): { mean: number | null; count: number } {
  return expandingMeanAsOf(
    outcomes.flatMap((outcome) =>
      regime && outcome.regime !== regime
        ? []
        : [{ endIndex: outcome.endIndex, value: outcome.target.get(sector) ?? null }],
    ),
    currentIndex,
  );
}

function expandingBaseScores(
  outcomes: readonly { endIndex: number; regime: DalioQuadrant; target: TargetMap }[],
  currentIndex: number,
  regime: DalioQuadrant,
): { unconditional: ScoreMap; regimeOnly: ScoreMap; completedMonths: number } | null {
  const completedMonths = new Set(
    outcomes.filter((outcome) => outcome.endIndex <= currentIndex).map((outcome) => outcome.endIndex),
  ).size;
  if (completedMonths < MIN_COMPLETED_TRAIN_MONTHS) return null;
  const unconditionalRaw: ScoreMap = new Map();
  const regimeRaw: ScoreMap = new Map();
  for (const definition of GICS_SECTOR_DEFS) {
    const unconditional = outcomeMean(outcomes, currentIndex, definition.sector);
    const conditional = outcomeMean(outcomes, currentIndex, definition.sector, regime);
    unconditionalRaw.set(definition.sector, unconditional.mean);
    if (unconditional.mean == null) {
      regimeRaw.set(definition.sector, null);
      continue;
    }
    const shrunk = conditional.mean == null
      ? unconditional.mean
      : (conditional.mean * conditional.count +
          unconditional.mean * REGIME_SHRINKAGE_MONTHS) /
        (conditional.count + REGIME_SHRINKAGE_MONTHS);
    regimeRaw.set(definition.sector, shrunk);
  }
  return {
    unconditional: rankNormalize(unconditionalRaw),
    regimeOnly: rankNormalize(regimeRaw),
    completedMonths,
  };
}

function evaluateScores(
  date: string,
  scores: ScoreMap,
  target: TargetMap,
): PeriodEvaluation | null {
  const rows = GICS_SECTOR_DEFS.flatMap((definition) => {
    const score = scores.get(definition.sector);
    const outcome = target.get(definition.sector);
    return score != null && Number.isFinite(score) && outcome != null && Number.isFinite(outcome)
      ? [{ score, outcome }]
      : [];
  });
  if (rows.length < MIN_EVALUATION_SECTORS) return null;
  const ic = spearmanIC(
    rows.map((row) => row.score),
    rows.map((row) => row.outcome),
  );
  if (ic == null || !Number.isFinite(ic)) return null;
  const ranked = [...rows].sort((left, right) => right.score - left.score);
  const top = ranked.slice(0, TOP_BUCKET_SIZE);
  const bottom = ranked.slice(-TOP_BUCKET_SIZE);
  const topMean = finiteMean(top.map((row) => row.outcome));
  const bottomMean = finiteMean(bottom.map((row) => row.outcome));
  if (topMean == null || bottomMean == null) return null;
  return {
    date,
    ic,
    hit: topMean > 0,
    top3Outcome: topMean,
    topBottomSpread: topMean - bottomMean,
    sectorCount: rows.length,
  };
}

function emptyMetricSummary(): SectorForwardMetricSummary {
  return {
    periods: 0,
    meanIc: null,
    icCiLow: null,
    icCiHigh: null,
    hitRate: null,
    meanTop3Outcome: null,
    meanTopBottomSpread: null,
    averageSectorCount: null,
  };
}

function summarizePeriods(
  periods: readonly PeriodEvaluation[],
  horizonMonths: number,
): SectorForwardMetricSummary {
  if (!periods.length) return emptyMetricSummary();
  const interval = neweyWestMeanInterval(
    periods.map((period) => period.ic),
    Math.max(0, horizonMonths - 1),
  );
  return {
    periods: periods.length,
    meanIc: interval.mean,
    icCiLow: interval.low,
    icCiHigh: interval.high,
    hitRate: periods.filter((period) => period.hit).length / periods.length,
    meanTop3Outcome: finiteMean(periods.map((period) => period.top3Outcome)),
    meanTopBottomSpread: finiteMean(periods.map((period) => period.topBottomSpread)),
    averageSectorCount: finiteMean(periods.map((period) => period.sectorCount)),
  };
}

function metricForRows(
  rows: readonly PredictionRow[],
  modelId: SectorForwardModelId,
  split: SectorForwardSplit,
  horizonMonths: number,
): SectorForwardMetricSummary {
  const periods = rows.flatMap((row) => {
    if (row.split !== split) return [];
    const evaluated = evaluateScores(
      row.date,
      row.scores[modelId],
      row.outcome.excessBySector,
    );
    return evaluated ? [evaluated] : [];
  });
  return summarizePeriods(periods, horizonMonths);
}

function verdictFor(summary: SectorForwardMetricSummary): SectorForwardVerdict {
  if (summary.periods < 24 || summary.meanIc == null) return "insufficient";
  if (
    summary.icCiLow != null &&
    summary.icCiLow > 0 &&
    (summary.meanTop3Outcome ?? 0) > 0 &&
    (summary.hitRate ?? 0) >= 0.55
  ) {
    return "supported";
  }
  if (
    summary.meanIc > 0 &&
    (summary.meanTop3Outcome ?? 0) > 0 &&
    (summary.hitRate ?? 0) >= 0.5
  ) {
    return "weak";
  }
  return "unsupported";
}

function verdictLabel(verdict: SectorForwardVerdict): string {
  if (verdict === "supported") return "样本外支持";
  if (verdict === "weak") return "方向偏正，证据不足";
  if (verdict === "unsupported") return "样本外不支持";
  return "样本不足";
}

function buildOutcomes(
  dates: readonly string[],
  regimes: ReadonlyMap<string, DalioQuadrant>,
  closes: ReadonlyMap<string, (number | null)[]>,
  horizon: number,
): HorizonOutcome[] {
  const spy = closes.get("SPY") ?? [];
  const out: HorizonOutcome[] = [];
  for (let signalIndex = 0; signalIndex + horizon < dates.length; signalIndex += 1) {
    const regime = regimes.get(dates[signalIndex]!);
    const startSpy = spy[signalIndex];
    const endSpy = spy[signalIndex + horizon];
    if (!regime || startSpy == null || endSpy == null || !(startSpy > 0)) continue;
    const spyReturn = endSpy / startSpy - 1;
    const absoluteBySector: TargetMap = new Map();
    const excessBySector: TargetMap = new Map();
    for (const definition of GICS_SECTOR_DEFS) {
      const series = closes.get(definition.etf) ?? [];
      const start = series[signalIndex];
      const end = series[signalIndex + horizon];
      if (start == null || end == null || !(start > 0)) continue;
      const absolute = end / start - 1;
      absoluteBySector.set(definition.sector, absolute);
      excessBySector.set(definition.sector, absolute - spyReturn);
    }
    out.push({
      signalIndex,
      endIndex: signalIndex + horizon,
      signalDate: dates[signalIndex]!,
      endDate: dates[signalIndex + horizon]!,
      regime,
      spyReturn,
      absoluteBySector,
      excessBySector,
    });
  }
  return out;
}

function buildModelScores(
  outcomes: readonly HorizonOutcome[],
  currentIndex: number,
  regime: DalioQuadrant,
  factorPanel: FactorPanel,
  date: string,
): ModelScores | null {
  const base = expandingBaseScores(
    outcomes.map((outcome) => ({
      endIndex: outcome.endIndex,
      regime: outcome.regime,
      target: outcome.excessBySector,
    })),
    currentIndex,
    regime,
  );
  if (!base) return null;
  const valuation = crossSectionComposite(
    factorPanel,
    date,
    VALUATION_FACTORS,
    2,
  );
  const fundamental = crossSectionComposite(
    factorPanel,
    date,
    FUNDAMENTAL_FACTORS,
    3,
  );
  return {
    unconditional: base.unconditional,
    regimeOnly: base.regimeOnly,
    regimeValuation: combineScores(base.regimeOnly, valuation),
    regimeFundamental: combineScores(base.regimeOnly, fundamental),
  };
}

function buildPredictionRows(
  dates: readonly string[],
  regimes: ReadonlyMap<string, DalioQuadrant>,
  outcomes: readonly HorizonOutcome[],
  factorPanel: FactorPanel,
): PredictionRow[] {
  const outcomeBySignalIndex = new Map(outcomes.map((outcome) => [outcome.signalIndex, outcome]));
  const rows: PredictionRow[] = [];
  for (let index = 0; index < dates.length; index += 1) {
    const outcome = outcomeBySignalIndex.get(index);
    const regime = regimes.get(dates[index]!);
    if (!outcome || !regime) continue;
    const scores = buildModelScores(outcomes, index, regime, factorPanel, dates[index]!);
    if (!scores) continue;
    const split = splitForEvaluation(dates[index]!, outcome.endDate);
    if (!split) continue;
    rows.push({
      date: dates[index]!,
      split,
      scores,
      outcome,
    });
  }
  return rows;
}

function portfolioSummary(
  rows: readonly PredictionRow[],
  modelId: SectorForwardModelId,
): SectorForwardPortfolioSummary {
  const testRows = rows.filter((row) => row.split === "test");
  let strategyNav = 1;
  let benchmarkNav = 1;
  let strategyPeak = 1;
  let benchmarkPeak = 1;
  let maxDrawdown = 0;
  let benchmarkMaxDrawdown = 0;
  let previousWeights: Map<GicsSector, number> | null = null;
  let turnoverSum = 0;
  let activeWins = 0;
  let periods = 0;
  for (const row of testRows) {
    const candidates = GICS_SECTOR_DEFS.flatMap((definition) => {
      const score = row.scores[modelId].get(definition.sector);
      const absolute = row.outcome.absoluteBySector.get(definition.sector);
      return score != null && absolute != null && Number.isFinite(score) && Number.isFinite(absolute)
        ? [{ sector: definition.sector, score, absolute }]
        : [];
    }).sort((left, right) => right.score - left.score);
    if (candidates.length < MIN_EVALUATION_SECTORS) continue;
    const selected = candidates.slice(0, TOP_BUCKET_SIZE);
    const weights = new Map<GicsSector, number>(
      selected.map((item) => [item.sector, 1 / selected.length]),
    );
    let turnover = 1;
    if (previousWeights) {
      turnover = GICS_SECTOR_DEFS.reduce((sum, definition) => {
        return sum + Math.abs(
          (weights.get(definition.sector) ?? 0) -
          (previousWeights?.get(definition.sector) ?? 0),
        );
      }, 0) / 2;
    }
    const grossReturn = finiteMean(selected.map((item) => item.absolute));
    if (grossReturn == null) continue;
    const netReturn = grossReturn - turnover * (PORTFOLIO_COST_BPS / 10_000);
    const benchmarkReturn = row.outcome.spyReturn;
    strategyNav *= Math.max(0, 1 + netReturn);
    benchmarkNav *= Math.max(0, 1 + benchmarkReturn);
    strategyPeak = Math.max(strategyPeak, strategyNav);
    benchmarkPeak = Math.max(benchmarkPeak, benchmarkNav);
    maxDrawdown = Math.min(maxDrawdown, strategyNav / strategyPeak - 1);
    benchmarkMaxDrawdown = Math.min(
      benchmarkMaxDrawdown,
      benchmarkNav / benchmarkPeak - 1,
    );
    if (netReturn > benchmarkReturn) activeWins += 1;
    turnoverSum += turnover;
    periods += 1;
    previousWeights = weights;
  }
  if (!periods) {
    return {
      periods: 0,
      annualizedReturn: null,
      benchmarkAnnualizedReturn: null,
      annualizedExcess: null,
      maxDrawdown: null,
      benchmarkMaxDrawdown: null,
      averageMonthlyTurnover: null,
      activeHitRate: null,
      costBps: PORTFOLIO_COST_BPS,
    };
  }
  const annualizedReturn = strategyNav ** (12 / periods) - 1;
  const benchmarkAnnualizedReturn = benchmarkNav ** (12 / periods) - 1;
  return {
    periods,
    annualizedReturn,
    benchmarkAnnualizedReturn,
    annualizedExcess: annualizedReturn - benchmarkAnnualizedReturn,
    maxDrawdown,
    benchmarkMaxDrawdown,
    averageMonthlyTurnover: turnoverSum / periods,
    activeHitRate: activeWins / periods,
    costBps: PORTFOLIO_COST_BPS,
  };
}

function buildFundamentalOutcomes(
  dates: readonly string[],
  regimes: ReadonlyMap<string, DalioQuadrant>,
  factorPanel: FactorPanel,
  horizon: number,
): FundamentalOutcome[] {
  const compositeByDate = new Map(
    dates.map((date) => [
      date,
      crossSectionComposite(factorPanel, date, FUNDAMENTAL_FACTORS, 3),
    ]),
  );
  const out: FundamentalOutcome[] = [];
  for (let signalIndex = 0; signalIndex + horizon < dates.length; signalIndex += 1) {
    const regime = regimes.get(dates[signalIndex]!);
    if (!regime) continue;
    const start = compositeByDate.get(dates[signalIndex]!);
    const end = compositeByDate.get(dates[signalIndex + horizon]!);
    if (!start || !end) continue;
    const deltaBySector: TargetMap = new Map();
    for (const definition of GICS_SECTOR_DEFS) {
      const a = start.get(definition.sector);
      const b = end.get(definition.sector);
      if (a != null && b != null) deltaBySector.set(definition.sector, b - a);
    }
    if (deltaBySector.size < MIN_EVALUATION_SECTORS) continue;
    out.push({
      signalIndex,
      endIndex: signalIndex + horizon,
      signalDate: dates[signalIndex]!,
      endDate: dates[signalIndex + horizon]!,
      regime,
      deltaBySector,
    });
  }
  return out;
}

function buildFundamentalPredictionRows(
  dates: readonly string[],
  regimes: ReadonlyMap<string, DalioQuadrant>,
  outcomes: readonly FundamentalOutcome[],
): FundamentalPredictionRow[] {
  const rows: FundamentalPredictionRow[] = [];
  const bySignalIndex = new Map(outcomes.map((outcome) => [outcome.signalIndex, outcome]));
  const compact = outcomes.map((outcome) => ({
    endIndex: outcome.endIndex,
    regime: outcome.regime,
    target: outcome.deltaBySector,
  }));
  for (let index = 0; index < dates.length; index += 1) {
    const outcome = bySignalIndex.get(index);
    const regime = regimes.get(dates[index]!);
    if (!outcome || !regime) continue;
    const base = expandingBaseScores(compact, index, regime);
    if (!base) continue;
    const split = splitForEvaluation(dates[index]!, outcome.endDate);
    if (!split) continue;
    rows.push({
      date: dates[index]!,
      split,
      unconditional: base.unconditional,
      regimeOnly: base.regimeOnly,
      outcome,
    });
  }
  return rows;
}

function fundamentalMetric(
  rows: readonly FundamentalPredictionRow[],
  model: "unconditional" | "regimeOnly",
  split: SectorForwardSplit,
  horizonMonths: number,
): SectorForwardMetricSummary {
  return summarizePeriods(
    rows.flatMap((row) => {
      if (row.split !== split) return [];
      const evaluated = evaluateScores(
        row.date,
        row[model],
        row.outcome.deltaBySector,
      );
      return evaluated ? [evaluated] : [];
    }),
    horizonMonths,
  );
}

function chooseValidationModel(
  models: readonly SectorForwardModelResult[],
  horizonMonths: SectorForwardHorizon,
): {
  modelId: Exclude<SectorForwardModelId, "unconditional">;
  passed: boolean;
} {
  const candidates: Array<Exclude<SectorForwardModelId, "unconditional">> = [
    "regimeOnly",
    "regimeValuation",
    "regimeFundamental",
  ];
  let best: Exclude<SectorForwardModelId, "unconditional"> = "regimeOnly";
  let bestIc = Number.NEGATIVE_INFINITY;
  for (const modelId of candidates) {
    const model = models.find((item) => item.id === modelId)!;
    const summary = model.horizons.find(
      (item) => item.horizonMonths === horizonMonths,
    )!.validation;
    if (summary.periods < 24 || summary.meanIc == null || summary.meanIc <= 0) continue;
    if (summary.meanIc > bestIc) {
      best = modelId;
      bestIc = summary.meanIc;
    }
  }
  return { modelId: best, passed: bestIc > 0 };
}

function modelCurrentRanking(
  scores: ScoreMap,
): SectorRegimeForwardStudyResponse["current"] extends infer Current
  ? Current extends { horizons: Array<infer Horizon> }
    ? Horizon extends { rankings: infer Rankings }
      ? Rankings
      : never
    : never
  : never {
  return GICS_SECTOR_DEFS.flatMap((definition) => {
    const score = scores.get(definition.sector);
    return score != null && Number.isFinite(score)
      ? [{
          rank: 0,
          sector: definition.sector,
          nameZh: definition.nameZh,
          etf: definition.etf,
          score,
        }]
      : [];
  })
    .sort((left, right) => right.score - left.score)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

async function loadFactorPanel(dates: readonly string[]): Promise<{
  panel: FactorPanel;
  rows: number;
  start: string | null;
  end: string | null;
  averageCoverage: number | null;
}> {
  const rows = await loadSectorFactorAggregates({
    dates,
    factorKeys: ALL_FACTOR_KEYS,
  });
  const panel: FactorPanel = new Map();
  const datesSeen: string[] = [];
  for (const row of rows) {
    const definition = GICS_SECTOR_DEFS.find((item) => item.sector === row.sector);
    if (!definition) continue;
    const date = iso(row.date);
    datesSeen.push(date);
    let bySector = panel.get(date);
    if (!bySector) panel.set(date, (bySector = new Map()));
    let byFactor = bySector.get(definition.sector);
    if (!byFactor) bySector.set(definition.sector, (byFactor = new Map()));
    byFactor.set(row.factorKey, {
      median: row.median,
      coverage: row.coverage,
    });
  }
  return {
    panel,
    rows: rows.length,
    start: datesSeen[0] ?? null,
    end: datesSeen.at(-1) ?? null,
    averageCoverage: finiteMean(rows.map((row) => row.coverage)),
  };
}

async function loadDataVersion(): Promise<string> {
  if (dataVersionCache && dataVersionCache.expiresAt > Date.now()) {
    return dataVersionCache.value;
  }
  const [regime, factors, prices] = await Promise.all([
    prisma.macroRegime.aggregate({ _max: { updatedAt: true } }),
    prisma.factorSectorSnapshot.aggregate({ _max: { updatedAt: true } }),
    prisma.equityDailyBar.aggregate({
      where: {
        symbol: {
          in: ["SPY", ...GICS_SECTOR_DEFS.map((definition) => definition.etf)],
        },
      },
      _max: { updatedAt: true },
    }),
  ]);
  const value = [regime._max.updatedAt, factors._max.updatedAt, prices._max.updatedAt]
    .map((date) => (date ? date.toISOString() : "none"))
    .join("|");
  dataVersionCache = { expiresAt: Date.now() + DATA_VERSION_TTL_MS, value };
  return value;
}

function currentRegimeMap(regimes: readonly StoredRegime[]): Map<string, DalioQuadrant> {
  return new Map(
    regimes.flatMap((row) => row.dalioRegime ? [[row.date, row.dalioRegime]] : []),
  );
}

async function buildStudy(): Promise<SectorRegimeForwardStudyResponse> {
  const regimes = await listStoredRegimes();
  if (regimes.length < 60) {
    throw new Error(`Regime 历史不足：仅 ${regimes.length} 个月，至少需要 60 个月`);
  }
  const dates = regimes.map((row) => row.date);
  const regimeByDate = currentRegimeMap(regimes);
  const symbols = ["SPY", ...GICS_SECTOR_DEFS.map((definition) => definition.etf)];
  const [closes, factorData] = await Promise.all([
    loadGridCloses(symbols, dates),
    loadFactorPanel(dates),
  ]);

  const outcomesByHorizon = new Map<number, HorizonOutcome[]>();
  const rowsByHorizon = new Map<number, PredictionRow[]>();
  for (const horizon of ALL_HORIZONS) {
    const outcomes = buildOutcomes(dates, regimeByDate, closes, horizon);
    outcomesByHorizon.set(horizon, outcomes);
    rowsByHorizon.set(
      horizon,
      buildPredictionRows(dates, regimeByDate, outcomes, factorData.panel),
    );
  }

  const modelIds: SectorForwardModelId[] = [
    "unconditional",
    "regimeOnly",
    "regimeValuation",
    "regimeFundamental",
  ];
  const models: SectorForwardModelResult[] = modelIds.map((modelId) => ({
    id: modelId,
    ...MODEL_META[modelId],
    horizons: SECTOR_FORWARD_HORIZONS.map((horizonMonths) => {
      const rows = rowsByHorizon.get(horizonMonths) ?? [];
      return {
        horizonMonths,
        train: metricForRows(rows, modelId, "train", horizonMonths),
        validation: metricForRows(rows, modelId, "validation", horizonMonths),
        test: metricForRows(rows, modelId, "test", horizonMonths),
      };
    }),
    testPortfolio: portfolioSummary(rowsByHorizon.get(1) ?? [], modelId),
  }));

  const selectedByHorizon = SECTOR_FORWARD_HORIZONS.map((horizonMonths) => {
    const selection = chooseValidationModel(models, horizonMonths);
    const modelId = selection.modelId;
    const model = models.find((item) => item.id === modelId)!;
    const horizon = model.horizons.find(
      (item) => item.horizonMonths === horizonMonths,
    )!;
    const verdict = verdictFor(horizon.test);
    return {
      horizonMonths,
      modelId,
      modelLabel: MODEL_META[modelId].label,
      selectionPassed: selection.passed,
      selectionNote: selection.passed
        ? "2015–2019 验证集平均 IC 为正，按最高值锁定。"
        : "验证集没有平均 IC 为正的候选模型，保留 Regime 基线用于失败复核。",
      validationMeanIc: horizon.validation.meanIc,
      test: horizon.test,
      verdict,
      verdictLabel: verdictLabel(verdict),
    };
  });

  const fundamentalOutlook = SECTOR_FORWARD_HORIZONS.map((horizonMonths) => {
    const outcomes = buildFundamentalOutcomes(
      dates,
      regimeByDate,
      factorData.panel,
      horizonMonths,
    );
    const rows = buildFundamentalPredictionRows(dates, regimeByDate, outcomes);
    const unconditionalValidation = fundamentalMetric(
      rows,
      "unconditional",
      "validation",
      horizonMonths,
    );
    const unconditionalTest = fundamentalMetric(
      rows,
      "unconditional",
      "test",
      horizonMonths,
    );
    const regimeValidation = fundamentalMetric(
      rows,
      "regimeOnly",
      "validation",
      horizonMonths,
    );
    const regimeTest = fundamentalMetric(rows, "regimeOnly", "test", horizonMonths);
    const verdict = verdictFor(regimeTest);
    return {
      horizonMonths,
      quarterLabel: horizonMonths === 3 ? "T+1季" : horizonMonths === 6 ? "T+2季" : "T+4季",
      unconditional: {
        validation: unconditionalValidation,
        test: unconditionalTest,
      },
      regimeOnly: {
        validation: regimeValidation,
        test: regimeTest,
      },
      verdict,
      verdictLabel: verdictLabel(verdict),
    };
  });

  const latestIndex = dates.length - 1;
  const latestDate = dates[latestIndex]!;
  const latestRegime = regimeByDate.get(latestDate) ?? null;
  let current: SectorRegimeForwardStudyResponse["current"] = null;
  if (latestRegime) {
    const currentHorizons = SECTOR_FORWARD_HORIZONS.flatMap((horizonMonths) => {
      const modelId = selectedByHorizon.find(
        (item) => item.horizonMonths === horizonMonths,
      )!.modelId;
      const scores = buildModelScores(
        outcomesByHorizon.get(horizonMonths) ?? [],
        latestIndex,
        latestRegime,
        factorData.panel,
        latestDate,
      );
      if (!scores) return [];
      const rankings = modelCurrentRanking(scores[modelId]);
      if (rankings.length < MIN_EVALUATION_SECTORS) return [];
      return [{
        horizonMonths,
        modelId,
        modelLabel: MODEL_META[modelId].label,
        selectionPassed: selectedByHorizon.find(
          (item) => item.horizonMonths === horizonMonths,
        )!.selectionPassed,
        trainingLabelCutoff: latestDate,
        rankings,
      }];
    });
    current = {
      signalDate: latestDate,
      regime: latestRegime,
      status: "researchOnly",
      statusLabel: "研究信号 · 非投资建议",
      horizons: currentHorizons,
    };
  }

  const primaryVerdicts = selectedByHorizon.map((item) => item.verdict);
  const supportedCount = primaryVerdicts.filter((item) => item === "supported").length;
  const weakCount = primaryVerdicts.filter((item) => item === "weak").length;
  const overallVerdict: SectorForwardVerdict = supportedCount >= 2
    ? "supported"
    : supportedCount + weakCount >= 2
      ? "weak"
      : primaryVerdicts.every((item) => item === "insufficient")
        ? "insufficient"
        : "unsupported";
  const overallSummary = overallVerdict === "supported"
    ? "至少两个前瞻窗口同时通过 2020+ 测试集的方向、置信区间、Top 3 超额与命中率门槛；仍受宏观修订值残留影响。"
    : overallVerdict === "weak"
      ? "部分窗口方向为正，但置信区间或命中率尚不足以证明稳定预测力，只能作为条件性研究输入。"
      : overallVerdict === "unsupported"
        ? "2020+ 测试集未形成稳定、可交易的行业排序证据，历史 Regime 关系不应直接外推。"
        : "有效样本不足，暂不能判断 Regime 的前瞻能力。";

  const etfAvailability = GICS_SECTOR_DEFS.map((definition) => {
    const series = closes.get(definition.etf) ?? [];
    const valid = series.flatMap((value, index) =>
      value != null && value > 0 ? [dates[index]!] : [],
    );
    return {
      sector: definition.sector,
      nameZh: definition.nameZh,
      etf: definition.etf,
      firstMonth: valid[0] ?? null,
      lastMonth: valid.at(-1) ?? null,
    };
  });

  return {
    version: SECTOR_REGIME_FORWARD_STUDY_VERSION,
    generatedAt: new Date().toISOString(),
    methodology: {
      evidenceGrade: "C",
      evidenceLabel: "回溯式伪样本外",
      signalTiming: "每个 T 只读取当月已落库 Regime、当期行业因子与 T 日前价格。",
      trainingRule: `扩展窗口；训练标签终点必须 ≤ T；至少 ${MIN_COMPLETED_TRAIN_MONTHS} 个已完成月份；Regime 均值向无条件均值收缩 ${REGIME_SHRINKAGE_MONTHS} 个月。`,
      modelSelectionRule: "只用 2015–2019 验证集平均 IC 选择候选模型，且 IC 必须为正；无候选通过时保留 Regime 基线作失败复核。2020+ 测试集不参与选择。",
      confidenceIntervalRule: "IC 均值使用 Newey–West 95% 区间，滞后阶数 = 前瞻月数−1，处理重叠收益标签。",
      returnTarget: "T+3/6/12 月行业 Sector SPDR 总收益减 SPY 总收益。",
      fundamentalTarget: "T+1/2/4 季行业成长、利润率、ROE 与杠杆截面复合分数的相对变化。",
      splits: {
        train: `≤ ${STAGE_F_TRAIN_END}`,
        validation: `2015-01-01 → ${STAGE_F_VALIDATION_END}`,
        test: `≥ ${STAGE_F_TEST_START}`,
      },
    },
    sample: {
      start: dates[0]!,
      end: dates.at(-1)!,
      regimeMonths: regimes.length,
      validRegimeMonths: regimeByDate.size,
      factorStart: factorData.start,
      factorEnd: factorData.end,
      factorRows: factorData.rows,
      averageFactorCoverage: factorData.averageCoverage,
      etfAvailability,
    },
    models,
    selectedByHorizon,
    fundamentalOutlook,
    current,
    overallVerdict: {
      verdict: overallVerdict,
      label: verdictLabel(overallVerdict),
      summary: overallSummary,
    },
    warnings: [
      "MacroRegime 使用估算发布日期隔离未来月份，但底层宏观值是最新修订值而非实时 vintage，因此不能称为严格 point-in-time。",
      `行业估值/基本面增强模型在 ${STAGE_F_FACTOR_SIGNAL_START.slice(0, 7)} 前强制停用，早期低覆盖因子只作预热。`,
      "行业估值与基本面因子使用历史标普成分和当时可见财报，但行业分类仍是当前 GICS 近似；增强模型证据等级不高于 C。",
      "XLC、XLRE 上市前不做合成回填；早期横截面按实际可交易 ETF 子集计算，至少需要 6 个行业。",
      "研究结论是行业层面的条件统计，不构成个股建议、确定性预测或因果证明。",
    ],
  };
}

export function clearSectorRegimeForwardStudyCache(): void {
  responseCache.clear();
  dataVersionCache = null;
}

export async function getSectorRegimeForwardStudy(): Promise<SectorRegimeForwardStudyResponse> {
  const version = await loadDataVersion();
  const key = `${SECTOR_REGIME_FORWARD_STUDY_VERSION}|${version}`;
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await buildStudy();
  responseCache.clear();
  responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
