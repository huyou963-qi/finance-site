import type { StyleBucketId } from "@/lib/equity/styleBuckets";

export const CORE_FUNDAMENTAL_FACTOR_KEYS = [
  "revenueYoY",
  "epsYoY",
  "opMargin",
] as const;

export type CoreFundamentalFactorKey = (typeof CORE_FUNDAMENTAL_FACTOR_KEYS)[number];

export type StageMetricSnapshot = {
  start: number | null;
  end: number | null;
  delta: number | null;
  p25Start: number | null;
  p75Start: number | null;
  p25End: number | null;
  p75End: number | null;
  coverageStart: number | null;
  coverageEnd: number | null;
  sampleStart: number | null;
  sampleEnd: number | null;
};

export type AttributionEvidence = {
  metric: string;
  value: number;
  threshold: number;
  message: string;
};

export type SectorAttribution = {
  fundamentalScore: number | null;
  valuationScore: number | null;
  label: string | null;
  evidence: AttributionEvidence[];
};

export type TheoryValidation = "confirmed" | "partial" | "rejected" | "inconclusive";

export type AttributionSectorInput = {
  sector: string;
  style: StyleBucketId;
  expectedLeader: boolean;
  fundamentals: Record<string, StageMetricSnapshot>;
  absoluteReturn: number | null;
  excessVsSpy: number | null;
};

export type AttributionSectorOutput = {
  sector: string;
  attribution: SectorAttribution;
  theoryValidation: TheoryValidation;
};

const SCORE_THRESHOLD = 0.5;
const MIN_COVERAGE = 0.6;
const MAD_SCALE = 1.4826;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/**
 * 同一阶段的行业横截面稳健标准分：median / MAD，单项截断在 ±3。
 * MAD 为 0 时不借用未来或其他阶段分布；相同值记 0，偏离值只保留方向并截到 ±3。
 */
export function robustCrossSectionZ(
  values: ReadonlyMap<string, number>,
): Map<string, number> {
  const finite = [...values.entries()].filter((entry): entry is [string, number] =>
    Number.isFinite(entry[1]),
  );
  if (finite.length < 2) return new Map();

  const center = median(finite.map(([, value]) => value));
  if (center == null) return new Map();
  const mad = median(finite.map(([, value]) => Math.abs(value - center))) ?? 0;
  const out = new Map<string, number>();

  for (const [key, value] of finite) {
    if (mad <= Number.EPSILON) {
      out.set(key, value === center ? 0 : value > center ? 3 : -3);
      continue;
    }
    out.set(key, clamp((value - center) / (MAD_SCALE * mad), -3, 3));
  }
  return out;
}

function metricDeltaForScore(metric: StageMetricSnapshot | undefined): number | null {
  if (!metric) return null;
  if (
    metric.coverageStart == null ||
    metric.coverageEnd == null ||
    metric.coverageStart < MIN_COVERAGE ||
    metric.coverageEnd < MIN_COVERAGE
  ) {
    return null;
  }
  return finiteOrNull(metric.delta);
}

function valuationExpansionRaw(metric: StageMetricSnapshot | undefined): number | null {
  if (!metric) return null;
  if (
    metric.coverageStart == null ||
    metric.coverageEnd == null ||
    metric.coverageStart < MIN_COVERAGE ||
    metric.coverageEnd < MIN_COVERAGE
  ) {
    return null;
  }
  const start = finiteOrNull(metric.start);
  const end = finiteOrNull(metric.end);
  if (start == null || end == null || start <= 0 || end <= 0) return null;
  return Math.log(start / end);
}

function average(values: readonly number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function hasSufficientCoreCoverage(
  fundamentals: Record<string, StageMetricSnapshot>,
): boolean {
  const endpointCoverage = CORE_FUNDAMENTAL_FACTOR_KEYS.map((factorKey) => {
    const metric = fundamentals[factorKey];
    if (metric?.coverageStart == null || metric.coverageEnd == null) return 0;
    return Math.min(metric.coverageStart, metric.coverageEnd);
  });
  return (average(endpointCoverage) ?? 0) >= MIN_COVERAGE;
}

function scoreEvidence(metric: string, value: number, threshold: number, message: string) {
  return { metric, value, threshold, message } satisfies AttributionEvidence;
}

function attributionLabel(input: {
  style: StyleBucketId;
  expectedLeader: boolean;
  absoluteReturn: number | null;
  excessVsSpy: number | null;
  fundamentalScore: number | null;
  valuationScore: number | null;
}): Pick<SectorAttribution, "label" | "evidence"> {
  const { style, expectedLeader, absoluteReturn, excessVsSpy, fundamentalScore, valuationScore } =
    input;

  if (expectedLeader && excessVsSpy != null && excessVsSpy <= 0) {
    return {
      label: "理论未兑现",
      evidence: [
        scoreEvidence("excessVsSpy", excessVsSpy, 0, "理论受益行业未取得正的相对 SPY 超额收益。"),
      ],
    };
  }

  if (fundamentalScore == null) {
    return {
      label: "数据不足，不归因",
      evidence: [],
    };
  }

  if (style === "defensive" && absoluteReturn != null && absoluteReturn < 0 && excessVsSpy != null && excessVsSpy > 0) {
    return {
      label: "相对防御有效",
      evidence: [
        scoreEvidence("absoluteReturn", absoluteReturn, 0, "绝对收益为负，但跌幅小于 SPY。"),
        scoreEvidence("excessVsSpy", excessVsSpy, 0, "相对 SPY 仍取得正超额。"),
      ],
    };
  }

  if (excessVsSpy == null) return { label: null, evidence: [] };

  if (
    excessVsSpy > 0 &&
    fundamentalScore >= SCORE_THRESHOLD &&
    valuationScore != null &&
    valuationScore >= SCORE_THRESHOLD
  ) {
    return {
      label: "盈利与估值共振",
      evidence: [
        scoreEvidence("fundamentalScore", fundamentalScore, SCORE_THRESHOLD, "基本面相对改善达到阈值。"),
        scoreEvidence("valuationScore", valuationScore, SCORE_THRESHOLD, "估值扩张达到阈值。"),
      ],
    };
  }

  if (
    excessVsSpy > 0 &&
    fundamentalScore >= SCORE_THRESHOLD &&
    valuationScore != null &&
    valuationScore > -SCORE_THRESHOLD &&
    valuationScore < SCORE_THRESHOLD
  ) {
    return {
      label: "基本面驱动",
      evidence: [
        scoreEvidence("fundamentalScore", fundamentalScore, SCORE_THRESHOLD, "基本面相对改善达到阈值。"),
      ],
    };
  }

  if (
    excessVsSpy > 0 &&
    fundamentalScore > -SCORE_THRESHOLD &&
    fundamentalScore < SCORE_THRESHOLD &&
    valuationScore != null &&
    valuationScore >= SCORE_THRESHOLD
  ) {
    return {
      label: "估值驱动",
      evidence: [
        scoreEvidence("valuationScore", valuationScore, SCORE_THRESHOLD, "估值扩张达到阈值。"),
      ],
    };
  }

  if (
    excessVsSpy > 0 &&
    fundamentalScore >= SCORE_THRESHOLD &&
    valuationScore != null &&
    valuationScore <= -SCORE_THRESHOLD
  ) {
    return {
      label: "盈利抵消估值收缩",
      evidence: [
        scoreEvidence("fundamentalScore", fundamentalScore, SCORE_THRESHOLD, "基本面相对改善达到阈值。"),
        scoreEvidence("valuationScore", valuationScore, -SCORE_THRESHOLD, "估值发生相对收缩。"),
      ],
    };
  }

  if (
    excessVsSpy > 0 &&
    fundamentalScore <= -SCORE_THRESHOLD &&
    valuationScore != null &&
    valuationScore >= SCORE_THRESHOLD
  ) {
    return {
      label: "预期先行，基本面尚未兑现",
      evidence: [
        scoreEvidence("fundamentalScore", fundamentalScore, -SCORE_THRESHOLD, "基本面相对变化仍偏弱。"),
        scoreEvidence("valuationScore", valuationScore, SCORE_THRESHOLD, "估值先行扩张。"),
      ],
    };
  }

  if (excessVsSpy < 0 && fundamentalScore <= -SCORE_THRESHOLD) {
    return {
      label: "基本面恶化",
      evidence: [
        scoreEvidence("fundamentalScore", fundamentalScore, -SCORE_THRESHOLD, "基本面相对恶化达到阈值。"),
      ],
    };
  }

  return { label: null, evidence: [] };
}

function validateTheory(
  row: AttributionSectorInput,
  rank: number | null,
): TheoryValidation {
  if (!row.expectedLeader) return "inconclusive";
  if (row.excessVsSpy == null || rank == null) return "inconclusive";
  if (row.excessVsSpy > 0 && rank <= 3) return "confirmed";
  if (row.excessVsSpy > 0) return "partial";
  return "rejected";
}

/**
 * 对一个阶段的 11 行业同时打分，确保所有 z 分数只使用本阶段横截面，避免跨期泄漏。
 */
export function scoreStageAttribution(
  rows: readonly AttributionSectorInput[],
): AttributionSectorOutput[] {
  const fundamentalZByMetric = new Map<string, Map<string, number>>();
  for (const factorKey of CORE_FUNDAMENTAL_FACTOR_KEYS) {
    const deltas = new Map<string, number>();
    for (const row of rows) {
      const delta = metricDeltaForScore(row.fundamentals[factorKey]);
      if (delta != null) deltas.set(row.sector, delta);
    }
    fundamentalZByMetric.set(factorKey, robustCrossSectionZ(deltas));
  }

  const valuationRaw = new Map<string, number>();
  for (const row of rows) {
    const raw = valuationExpansionRaw(row.fundamentals.earningsYield);
    if (raw != null) valuationRaw.set(row.sector, raw);
  }
  const valuationZ = robustCrossSectionZ(valuationRaw);

  const returnRank = new Map<string, number>();
  rows
    .filter((row) => row.excessVsSpy != null)
    .sort((a, b) => b.excessVsSpy! - a.excessVsSpy!)
    .forEach((row, index) => returnRank.set(row.sector, index + 1));

  return rows.map((row) => {
    const fundamentalParts = CORE_FUNDAMENTAL_FACTOR_KEYS
      .map((factorKey) => fundamentalZByMetric.get(factorKey)?.get(row.sector) ?? null)
      .filter((value): value is number => value != null);
    const fundamentalScore =
      fundamentalParts.length >= 2 && hasSufficientCoreCoverage(row.fundamentals)
        ? average(fundamentalParts)
        : null;
    const valuationScore = valuationZ.get(row.sector) ?? null;
    const { label, evidence } = attributionLabel({
      style: row.style,
      expectedLeader: row.expectedLeader,
      absoluteReturn: row.absoluteReturn,
      excessVsSpy: row.excessVsSpy,
      fundamentalScore,
      valuationScore,
    });

    return {
      sector: row.sector,
      attribution: {
        fundamentalScore,
        valuationScore,
        label,
        evidence,
      },
      theoryValidation: validateTheory(row, returnRank.get(row.sector) ?? null),
    };
  });
}
