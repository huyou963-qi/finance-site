/**
 * 由 ChartLayer + 价格/基本面缓存派生 LWC LineData。
 */

import type { LineData, UTCTimestamp } from "lightweight-charts";
import {
  applyTransform,
  closesToTimed,
  evaluateExpressionOnSeries,
  stepFillToDaily,
  type TimedValue,
} from "@/lib/chart/alignSeries";
import {
  effectiveTransform,
  type ChartLayer,
  type ChartLayersPrefs,
  type FundamentalMetric,
} from "@/lib/chart/chartLayers";
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
  },
): DerivedLayerSeries[] {
  const primaryTimes = candleTimesFromPrimary(opts.primaryCloses);
  const out: DerivedLayerSeries[] = [];

  for (const layer of prefs.layers) {
    if (!layer.visible) continue;
    const transform = effectiveTransform(layer, prefs.compareMode);
    let timed: TimedValue[] = [];
    let error: string | undefined;
    let alignedCount = 0;

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
    const lastValue =
      points.length > 0 ? (points[points.length - 1]!.value as number) : null;

    out.push({
      layerId: layer.id,
      label: layer.label,
      color: layer.color,
      lineWidth: layer.lineWidth,
      style: layer.style,
      axis: layer.axis,
      points,
      alignedCount,
      error: points.length ? undefined : error,
      lastValue,
    });
  }
  return out;
}
