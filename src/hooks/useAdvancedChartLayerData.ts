"use client";

import { useEffect, useMemo, useState } from "react";
import { layerCalculationFrequency, layerSeriesKey, type LayerData, type LayerSeriesRef, type PriceField } from "@/lib/chart/layerCalculation";
import type { ChartLayer } from "@/lib/chart/chartLayers";
import type { TimedValue } from "@/lib/chart/alignSeries";
import { loadLayerPriceHistory } from "@/lib/chart/layerPriceHistory";
import type { FundamentalSeriesBundle } from "@/lib/chart/deriveLayerSeries";
import { forwardPeFromCloses, type ForwardEpsPoint } from "@/lib/data/forwardPeSeries";
import type { KlinePayload } from "@/lib/data/types";
import type { PriceAdjustmentMode } from "@/lib/equity/priceAdjustment";
import { horzTimeToUnixSec } from "@/lib/chart/klineRangeStats";

const DAY = 86400;
const PERIODS_IN_DAYS = { month: 31, quarter: 93, year: 366 };
const INTERVAL_IN_DAYS: Record<string, number> = { "1d": 2, "1w": 7, "1M": 31, "15m": 1, "1h": 1, "4h": 1 };
type Request = { ref: LayerSeriesRef; chart: boolean; sampled: boolean; warmup: number };
type MarketPoint = { time: number } & Partial<Record<PriceField, number>>;

function collectRequests(layers: ChartLayer[], interval: string): Request[] {
  const byKey = new Map<string, Request>();
  const add = (ref: LayerSeriesRef, chart: boolean, sampled: boolean, warmup: number) => {
    const key = layerSeriesKey(ref);
    const previous = byKey.get(key);
    byKey.set(key, { ref, chart: chart || !!previous?.chart, sampled: sampled || !!previous?.sampled,
      warmup: Math.max(warmup, previous?.warmup ?? 0) });
  };
  for (const { visible, source } of layers) {
    if (!visible) continue;
    if (source.kind === "series") add(source.series, true, false, 0);
    if (source.kind === "calculation") {
      const calc = source.calculation;
      const frequency = layerCalculationFrequency(calc);
      const sampled = frequency !== "keep";
      const daysPerPeriod = sampled ? PERIODS_IN_DAYS[frequency] : INTERVAL_IN_DAYS[interval] ?? 2;
      const window = calc.operation === "formula" ? 1 : calc.window;
      const lag = calc.inputs.some(input => input.transform === "yoy") ? 366 : daysPerPeriod;
      for (const { series } of calc.inputs) add(series, !sampled, sampled, Math.min(daysPerPeriod * (window + 2) + lag, 30 * 366));
    }
  }
  return [...byKey.values()].sort((a, b) => layerSeriesKey(a.ref).localeCompare(layerSeriesKey(b.ref)));
}

async function requestJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("叠加数据暂时无法加载");
  return response.json() as Promise<T>;
}

async function marketHistory(symbol: string, interval: string, adjust: PriceAdjustmentMode, from: number, signal: AbortSignal) {
  return loadLayerPriceHistory<MarketPoint>(async before => {
    const query = new URLSearchParams({ symbol, interval, adjust, limit: "1000" });
    if (before != null) query.set("before", String(before));
    const payload = await requestJson<KlinePayload>(`/api/data/klines?${query}`, signal);
    if (payload.symbol.toUpperCase() !== symbol) throw new Error("返回资产与请求不一致");
    return payload.candles.flatMap((bar, index) => {
      const time = horzTimeToUnixSec(bar.time);
      if (time == null) return [];
      const volume = payload.volumeAvailable === false ? undefined : payload.volumes?.[index];
      return [{
        time, close: bar.close,
        ...(payload.observationOnly ? {} : { open: bar.open, high: bar.high, low: bar.low }),
        ...(volume != null && (payload.source !== "yahoo" || volume > 0) ? { volume } : {}),
      }];
    });
  }, from, signal);
}

async function fetchMacro(id: string, from: number, signal: AbortSignal): Promise<LayerData> {
  type Point = { date: string; value: number };
  const query = new URLSearchParams({ instrumentId: id, from: new Date(from * 1000).toISOString().slice(0, 10), limit: "20000", timing: "available" });
  const response = await requestJson<{ points: Point[]; available?: Point[]; timingEstimated?: boolean }>(`/api/data/macro-observations?${query}`, signal);
  const convert = (points: Point[]) => points.map(point => ({ time: Date.parse(point.date) / 1000, value: point.value }))
    .filter(point => Number.isFinite(point.time) && Number.isFinite(point.value)).sort((a, b) => a.time - b.time);
  return { points: convert(response.points), available: convert(response.available ?? []), timingEstimated: response.timingEstimated };
}

type FinancialRef = Extract<LayerSeriesRef, { kind: "financial" }>;
type FinancialResponse = FundamentalSeriesBundle & { available?: Partial<Record<FinancialRef["metric"], TimedValue[]>> };

function seriesForFinancial(response: FinancialResponse, metric: Exclude<FinancialRef["metric"], "forwardPe">): LayerData {
  if (metric === "ttmPe" || metric === "pb") return { points: response.daily?.[metric] ?? [], timingEstimated: true };
  const scale = metric.endsWith("Margin") ? 100 : 1;
  const points = (response.quarterly?.[metric] ?? []).map(point => ({ time: Date.parse(point.fiscalDate) / 1000, value: point.value * scale }))
    .sort((a, b) => a.time - b.time);
  return { points, available: (response.available?.[metric] ?? []).map(point => ({ ...point, value: point.value * scale })) };
}

export function useAdvancedChartLayerData(layers: ChartLayer[], interval: string, adjustment: PriceAdjustmentMode, from: number | null) {
  const requestKey = useMemo(() => JSON.stringify(collectRequests(layers, interval)), [layers, interval]);
  const key = JSON.stringify([requestKey, interval, adjustment, from]);
  const [loaded, setLoaded] = useState<{ key: string; data: Map<string, LayerData>; errors: string[] }>();
  useEffect(() => {
    const requests: Request[] = JSON.parse(requestKey);
    if (!requests.length || from == null) return;
    const controller = new AbortController();
    const { signal } = controller;
    const data = new Map<string, LayerData>();
    const errors: string[] = [];
    const earliest = from - Math.max(...requests.map(req => req.warmup)) * DAY;
    const prices = new Map<string, Promise<MarketPoint[]>>();
    const financials = new Map<string, Promise<FinancialResponse>>();
    const loadMarket = (symbol: string, period: string) => {
      const cacheKey = `${symbol}:${period}`;
      let pending = prices.get(cacheKey);
      if (!pending) {
        pending = marketHistory(symbol, period, adjustment, earliest, signal);
        prices.set(cacheKey, pending);
      }
      return pending;
    };
    const loadFinancial = (symbol: string) => {
      let pending = financials.get(symbol);
      if (!pending) {
        const metrics = [...new Set(requests.flatMap(({ ref }) => ref.kind === "financial" &&
          ref.symbol === symbol && ref.metric !== "forwardPe" ? [ref.metric] : []))];
        const query = new URLSearchParams({ symbol, metrics: metrics.join(","), timing: "available" });
        pending = requestJson<FinancialResponse>(`/api/data/chart-fundamentals?${query}`, signal);
        financials.set(symbol, pending);
      }
      return pending;
    };
    void Promise.all(requests.map(async ({ ref, chart, sampled }) => {
      const dataKey = layerSeriesKey(ref);
      try {
        if (ref.kind === "macro") {
          data.set(dataKey, await fetchMacro(ref.id, earliest, signal));
        } else if (ref.kind === "market") {
          const convert = (rows: MarketPoint[]) => rows.flatMap(point => {
            const value = point[ref.field];
            return value != null && Number.isFinite(value) ? [{ time: point.time, value }] : [];
          });
          const [native, daily] = await Promise.all([
            chart ? loadMarket(ref.symbol, interval) : Promise.resolve([]),
            sampled ? loadMarket(ref.symbol, "1d") : Promise.resolve([]),
          ]);
          data.set(dataKey, { points: convert(native), sampled: sampled ? convert(daily) : undefined });
        } else if (ref.metric === "forwardPe") {
          const [price, estimates] = await Promise.all([
            loadMarket(ref.symbol, "1d"),
            requestJson<{ timeline?: ForwardEpsPoint[] }>(`/api/data/forward-pe?symbol=${encodeURIComponent(ref.symbol)}`, signal),
          ]);
          const closes = price.flatMap(point => point.close == null ? [] : [{ time: point.time, close: point.close }]);
          data.set(dataKey, { points: forwardPeFromCloses(closes, estimates.timeline ?? []) });
        } else {
          data.set(dataKey, seriesForFinancial(await loadFinancial(ref.symbol), ref.metric));
        }
      } catch {
        if (!signal.aborted) errors.push(ref.kind === "macro" ? ref.label : ref.symbol);
      }
    })).then(() => {
      if (!signal.aborted) setLoaded({ key, data, errors: [...new Set(errors)] });
    });
    return () => controller.abort();
  }, [key, requestKey, from, interval, adjustment]);
  return useMemo(() => ({
    data: loaded?.key === key ? loaded.data : new Map<string, LayerData>(),
    errors: loaded?.key === key ? loaded.errors : [],
    loading: requestKey !== "[]" && from != null && loaded?.key !== key,
  }), [loaded, key, requestKey, from]);
}
