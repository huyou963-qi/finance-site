/**
 * 由 ChartLayer + 价格/基本面缓存派生 LWC LineData。
 */

import type { LineData, UTCTimestamp, WhitespaceData } from "lightweight-charts";
import {
  applyTransform,
  closesToTimed,
  evaluateExpressionOnSeries,
  stepFillToDaily,
  type TimedValue,
} from "@/lib/chart/alignSeries";
import {
  chartLayerUnit,
  layerAxisConflict,
  effectiveTransform,
  type ChartLayer,
  type ChartLayersPrefs,
  type FundamentalMetric,
} from "@/lib/chart/chartLayers";
import { evaluateLayerCalculation, layerSeriesKey, type LayerData } from "./layerCalculation";
import {
  evalExprAst,
  parseLayerExpression,
} from "@/lib/chart/layerExpression";

export type PriceClosePoint = { time: number; close: number };

export type FundamentalSeriesBundle = {
  /** 日线估值（已对齐或稀疏均可；客户端再对齐） */
  daily?: Partial<Record<"ttmPe" | "forwardPe" | "pb", TimedValue[]>>;
  /** 季频点：fiscalDate + value */
  quarterly?: Partial<
    Record<
      "eps" | "revenue" | "grossMargin" | "operatingMargin" | "netMargin",
      { fiscalDate: string; value: number }[]
    >
  >;
};

export type DerivedLayerSeries = {
  layerId: string;
  label: string;
  color: string;
  lineWidth: 1 | 2 | 3;
  style: ChartLayer["style"];
  axis: ChartLayer["axis"];
  points: LineData[];
  /** 共同交易日数量（表达式对齐后） */
  alignedCount: number;
  error?: string;
  lastValue: number | null;
  unit?: string;
  fixedRange?: { minValue: number; maxValue: number };
  timingEstimated?: boolean;
  axisAdjusted?: boolean;
  renderPoints?: (LineData | WhitespaceData)[];
  sampleCount?: number;
};

function toLineData(points: TimedValue[]): LineData[] {
  return points.map((p) => ({
    time: p.time as UTCTimestamp,
    value: p.value,
  }));
}

function candleTimesFromPrimary(
  primaryCloses: PriceClosePoint[],
): number[] {
  return primaryCloses.map((p) => p.time).sort((a, b) => a - b);
}

function resolveFundamentalSeries(
  metric: FundamentalMetric,
  bundle: FundamentalSeriesBundle | undefined,
  primaryTimes: number[],
): { points: TimedValue[]; error?: string } {
  if (!bundle) return { points: [], error: "无基本面数据" };

  if (metric === "ttmPe" || metric === "forwardPe" || metric === "pb") {
    const pts = bundle.daily?.[metric] ?? [];
    return pts.length ? { points: pts } : { points: [], error: `${metric} 暂无数据` };
  }

  const qKey =
    metric === "operatingMargin"
      ? "operatingMargin"
      : metric === "grossMargin"
        ? "grossMargin"
        : metric === "netMargin"
          ? "netMargin"
          : metric === "eps"
            ? "eps"
            : "revenue";
  const quarters = bundle.quarterly?.[qKey] ?? [];
  if (!quarters.length) return { points: [], error: `${metric} 暂无数据` };
  return { points: stepFillToDaily(quarters, primaryTimes) };
}

export function deriveLayerSeries(
  prefs: ChartLayersPrefs,
  opts: {
    primaryCloses: PriceClosePoint[];
    priceBySymbol: Record<string, PriceClosePoint[]>;
    fundamentalsBySymbol: Record<string, FundamentalSeriesBundle>;
    /** 指数化相对可见区左缘（可选） */
    indexFromSec?: number | null;
    seriesByKey?: ReadonlyMap<string, LayerData>;
    nowSec?: number;
    primaryUnit?: string;
    primarySymbol?: string;
  },
): DerivedLayerSeries[] {
  const primaryTimes = candleTimesFromPrimary(opts.primaryCloses);
  const out: DerivedLayerSeries[] = [];
  const series = opts.seriesByKey ?? new Map<string, LayerData>();
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const first = primaryTimes[0] ?? -Infinity;
  const effectiveLayers = prefs.layers.map(layer => ({ ...layer, transform: effectiveTransform(layer, prefs.compareMode) }));
  const assigned: ChartLayer[] = effectiveLayers.filter(layer => layer.source.kind !== "series" && layer.source.kind !== "calculation");

  for (const layer of effectiveLayers) {
    if (!layer.visible) continue;
    const transform = layer.transform;
    const conflict = layerAxisConflict(layer, assigned, opts.primaryUnit, opts.primarySymbol);
    const axis = conflict ? { mode: "subpane" as const } : layer.axis;
    assigned.push({ ...layer, axis });
    let timed: TimedValue[] = [];
    let error: string | undefined;
    let alignedCount = 0;
    let timingEstimated = false;
    let sampleCount: number | undefined;
    let missing: number[] = [];

    if (layer.source.kind === "price") {
      const closes = opts.priceBySymbol[layer.source.symbol] ?? [];
      timed = closesToTimed(closes);
      alignedCount = timed.length;
      if (!timed.length) error = `${layer.source.symbol} 价格未加载`;
    } else if (layer.source.kind === "expr") {
      const parsed = parseLayerExpression(layer.source.expr);
      if (!parsed.ok) {
        error = parsed.error;
      } else {
        const bySym: Record<string, TimedValue[]> = {};
        for (const s of parsed.symbols) {
          bySym[s] = closesToTimed(opts.priceBySymbol[s] ?? []);
        }
        timed = evaluateExpressionOnSeries(parsed.symbols, bySym, (vals) =>
          evalExprAst(parsed.ast, vals),
        );
        alignedCount = timed.length;
        if (!timed.length) error = "无共同交易日或运算结果为空";
      }
    } else if (layer.source.kind === "series") {
      timed = (series.get(layerSeriesKey(layer.source.series))?.points ?? []).filter(point => point.time >= first);
      alignedCount = timed.length;
      if (!timed.length) error = "序列暂无数据";
    } else if (layer.source.kind === "calculation") {
      const result = evaluateLayerCalculation(layer.source.calculation, series, nowSec);
      timed = result.points.filter(point => point.time >= first);
      error = result.error ?? "有效样本不足";
      alignedCount = result.alignedCount;
      timingEstimated = result.timingEstimated;
      sampleCount = result.sampleCount;
      missing = result.missing;
    } else {
      const bundle = opts.fundamentalsBySymbol[layer.source.symbol];
      const res = resolveFundamentalSeries(
        layer.source.metric,
        bundle,
        primaryTimes,
      );
      timed = res.points;
      alignedCount = timed.length;
      error = res.error;
    }

    const transformed = applyTransform(timed, transform, opts.indexFromSec);
    const points = toLineData(transformed);
    // Keep interior gaps for the chart while retaining numeric points for range summaries.
    const renderPoints = missing.length && points.length ? [
      ...points,
      ...missing.filter(time => time > Number(points[0]!.time) && time < Number(points.at(-1)!.time))
        .map(time => ({ time: time as UTCTimestamp })),
    ].sort((a, b) => Number(a.time) - Number(b.time)) : undefined;
    const lastValue =
      points.length > 0 ? (points[points.length - 1]!.value as number) : null;

    out.push({
      layerId: layer.id,
      label: layer.label,
      color: layer.color,
      lineWidth: layer.lineWidth,
      style: layer.style,
      axis,
      unit: chartLayerUnit(layer, opts.primaryUnit, opts.primarySymbol),
      fixedRange: layer.source.kind === "calculation" && layer.source.calculation.operation === "correlation" && transform === "raw"
        ? { minValue: -1, maxValue: 1 } : undefined,
      timingEstimated,
      renderPoints,
      sampleCount,
      axisAdjusted: !!conflict,
      points,
      alignedCount,
      error: points.length ? undefined : error,
      lastValue,
    });
  }
  return out;
}
