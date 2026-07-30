"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PriceAdjustmentMode } from "@/lib/equity/priceAdjustment";
import {
  applyLayerTemplate,
  chartLayersStructKey,
  CHART_LAYER_MAX,
  collectFundamentalRequests,
  collectPriceSymbolsFromLayers,
  createChartLayer,
  loadChartLayersPrefs,
  saveChartLayersPrefs,
  type ChartLayer,
  type ChartLayerSource,
  type ChartLayersPrefs,
  type FundamentalMetric,
  type LayerTemplateId,
} from "@/lib/chart/chartLayers";
import {
  deriveLayerSeries,
  type DerivedLayerSeries,
  type FundamentalSeriesBundle,
  type PriceClosePoint,
} from "@/lib/chart/deriveLayerSeries";
import { listSymbolsInExpression } from "@/lib/chart/layerExpression";
import {
  forwardPeFromCloses,
  type ForwardEpsPoint,
} from "@/lib/data/forwardPeSeries";
import type { CandlestickData } from "lightweight-charts";

function candleToCloses(candles: CandlestickData[]): PriceClosePoint[] {
  const out: PriceClosePoint[] = [];
  for (const c of candles) {
    const t =
      typeof c.time === "number"
        ? c.time
        : typeof c.time === "string"
          ? Math.floor(Date.parse(c.time) / 1000)
          : null;
    if (t == null || !Number.isFinite(c.close)) continue;
    out.push({ time: t, close: c.close });
  }
  return out;
}

async function fetchSymbolCloses(
  symbol: string,
  interval: string,
  adjust: PriceAdjustmentMode,
  limit: number,
): Promise<PriceClosePoint[]> {
  const qs = new URLSearchParams({
    symbol,
    interval,
    limit: String(limit),
    adjust,
  });
  const r = await fetch(`/api/data/klines?${qs}`);
  const j = (await r.json().catch(() => ({}))) as {
    error?: string;
    candles?: CandlestickData[];
  };
  if (!r.ok) throw new Error(j.error ?? `${r.status}`);
  return candleToCloses(j.candles ?? []);
}

export function useChartLayers(opts: {
  primarySymbol: string;
  interval: string;
  priceAdjustment: PriceAdjustmentMode;
  primaryCandles: CandlestickData[];
  /** 与主图首屏一致的条数，叠加标的对齐长度 */
  fetchLimit?: number;
  /** 指数化相对可见区左缘 */
  indexFromSec?: number | null;
}) {
  const {
    primarySymbol,
    interval,
    priceAdjustment,
    primaryCandles,
    fetchLimit = 500,
    indexFromSec = null,
  } = opts;

  const [prefs, setPrefs] = useState<ChartLayersPrefs>({
    layers: [],
    compareMode: false,
  });
  const [hydrated, setHydrated] = useState(false);
  const [priceBySymbol, setPriceBySymbol] = useState<
    Record<string, PriceClosePoint[]>
  >({});
  const [fundamentalsBySymbol, setFundamentalsBySymbol] = useState<
    Record<string, FundamentalSeriesBundle>
  >({});
  const [layerErrors, setLayerErrors] = useState<string[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  useEffect(() => {
    setPrefs(loadChartLayersPrefs(primarySymbol));
    setHydrated(true);
  }, [primarySymbol]);

  useEffect(() => {
    if (!hydrated || !primarySymbol.trim()) return;
    saveChartLayersPrefs(primarySymbol, prefs);
  }, [prefs, primarySymbol, hydrated]);

  const primaryCloses = useMemo(
    () => candleToCloses(primaryCandles),
    [primaryCandles],
  );

  // Keep primary closes in price cache
  useEffect(() => {
    const sym = primarySymbol.trim().toUpperCase();
    if (!sym || !primaryCloses.length) return;
    setPriceBySymbol((prev) => {
      if (prev[sym] === primaryCloses) return prev;
      return { ...prev, [sym]: primaryCloses };
    });
  }, [primarySymbol, primaryCloses]);

  const neededPriceSymbols = useMemo(() => {
    const syms = collectPriceSymbolsFromLayers(prefs.layers, listSymbolsInExpression);
    const primary = primarySymbol.trim().toUpperCase();
    return syms.filter((s) => s !== primary);
  }, [prefs.layers, primarySymbol]);

  const fundReqs = useMemo(
    () => collectFundamentalRequests(prefs.layers),
    [prefs.layers],
  );

  const neededPriceKey = neededPriceSymbols.join(",");
  const fundReqsKey = useMemo(() => JSON.stringify(fundReqs), [fundReqs]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!neededPriceSymbols.length && !fundReqs.length) {
        setLayerErrors([]);
        return;
      }
      setLoadingExtra(true);
      const errors: string[] = [];

      await Promise.all(
        neededPriceSymbols.map(async (sym) => {
          try {
            const closes = await fetchSymbolCloses(
              sym,
              interval,
              priceAdjustment,
              fetchLimit,
            );
            if (cancelled) return;
            setPriceBySymbol((prev) => ({ ...prev, [sym]: closes }));
          } catch (e) {
            errors.push(
              `${sym}: ${e instanceof Error ? e.message : "价格加载失败"}`,
            );
          }
        }),
      );

      await Promise.all(
        fundReqs.map(async ({ symbol, metrics }) => {
          const hasFwd = metrics.includes("forwardPe");
          const rest = metrics.filter((m) => m !== "forwardPe");
          const bundle: FundamentalSeriesBundle = {
            daily: {},
            quarterly: {},
          };

          if (rest.length) {
            try {
              const qs = new URLSearchParams({
                symbol,
                metrics: rest.join(","),
              });
              const r = await fetch(`/api/data/chart-fundamentals?${qs}`);
              const j = (await r.json().catch(() => ({}))) as {
                error?: string;
                daily?: FundamentalSeriesBundle["daily"];
                quarterly?: FundamentalSeriesBundle["quarterly"];
              };
              if (!r.ok) throw new Error(j.error ?? `${r.status}`);
              bundle.daily = { ...bundle.daily, ...(j.daily ?? {}) };
              bundle.quarterly = { ...bundle.quarterly, ...(j.quarterly ?? {}) };
            } catch (e) {
              errors.push(
                `${symbol} 基本面: ${e instanceof Error ? e.message : "加载失败"}`,
              );
            }
          }

          if (hasFwd) {
            try {
              const r = await fetch(
                `/api/data/forward-pe?symbol=${encodeURIComponent(symbol)}`,
              );
              const j = (await r.json().catch(() => ({}))) as {
                error?: string;
                timeline?: ForwardEpsPoint[];
              };
              if (!r.ok) throw new Error(j.error ?? `${r.status}`);
              const closes =
                symbol === primarySymbol.trim().toUpperCase()
                  ? primaryCloses
                  : (await fetchSymbolCloses(
                      symbol,
                      interval,
                      priceAdjustment,
                      fetchLimit,
                    ));
              const pe = forwardPeFromCloses(closes, j.timeline ?? []);
              bundle.daily = { ...bundle.daily, forwardPe: pe };
            } catch (e) {
              errors.push(
                `${symbol} Forward PE: ${e instanceof Error ? e.message : "加载失败"}`,
              );
            }
          }

          if (!cancelled) {
            setFundamentalsBySymbol((prev) => ({
              ...prev,
              [symbol]: {
                daily: { ...prev[symbol]?.daily, ...bundle.daily },
                quarterly: {
                  ...prev[symbol]?.quarterly,
                  ...bundle.quarterly,
                },
              },
            }));
          }
        }),
      );

      if (!cancelled) {
        setLayerErrors(errors);
        setLoadingExtra(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    neededPriceKey,
    fundReqsKey,
    neededPriceSymbols,
    fundReqs,
    interval,
    priceAdjustment,
    fetchLimit,
    primarySymbol,
    primaryCloses,
  ]);

  const derived = useMemo(
    () =>
      deriveLayerSeries(prefs, {
        primaryCloses,
        priceBySymbol,
        fundamentalsBySymbol,
        indexFromSec,
      }),
    [prefs, primaryCloses, priceBySymbol, fundamentalsBySymbol, indexFromSec],
  );

  const structKey = useMemo(() => chartLayersStructKey(prefs), [prefs]);

  const setLayers = useCallback((updater: (prev: ChartLayer[]) => ChartLayer[]) => {
    setPrefs((p) => ({ ...p, layers: updater(p.layers).slice(0, CHART_LAYER_MAX) }));
  }, []);

  const addLayer = useCallback(
    (source: ChartLayerSource, partial?: Parameters<typeof createChartLayer>[2]) => {
      setPrefs((p) => {
        if (p.layers.length >= CHART_LAYER_MAX) return p;
        const layer = createChartLayer(source, p.layers, partial);
        return { ...p, layers: [...p.layers, layer] };
      });
      return true;
    },
    [],
  );

  const updateLayer = useCallback((id: string, patch: Partial<ChartLayer>) => {
    setPrefs((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }, []);

  const removeLayer = useCallback((id: string) => {
    setPrefs((p) => ({
      ...p,
      layers: p.layers.filter((l) => l.id !== id),
    }));
  }, []);

  const setCompareMode = useCallback((compareMode: boolean) => {
    setPrefs((p) => ({ ...p, compareMode }));
  }, []);

  const applyTemplate = useCallback(
    (templateId: LayerTemplateId, peerSymbol?: string) => {
      setPrefs((p) => ({
        ...p,
        layers: applyLayerTemplate(
          templateId,
          primarySymbol,
          p.layers,
          peerSymbol,
        ).slice(0, CHART_LAYER_MAX),
      }));
    },
    [primarySymbol],
  );

  const canAdd = prefs.layers.length < CHART_LAYER_MAX;

  return {
    prefs,
    layers: prefs.layers,
    compareMode: prefs.compareMode,
    derived: derived as DerivedLayerSeries[],
    structKey,
    layerErrors,
    loadingExtra,
    canAdd,
    addLayer,
    updateLayer,
    removeLayer,
    setLayers,
    setCompareMode,
    applyTemplate,
    setPrefs,
  };
}

export type UseChartLayersReturn = ReturnType<typeof useChartLayers>;

export type { FundamentalMetric };
