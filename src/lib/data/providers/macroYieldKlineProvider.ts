import type { UTCTimestamp } from "lightweight-charts";
import { loadFredObservationMapsDbFirst } from "../fredDbFirst";
import { findMarketInstrument } from "../marketInstruments";
import { normalizeTickerSymbol } from "../tickerSymbolNormalize";
import type { KlineMarketDataProvider } from "./klineProviderTypes";
import { clampKlineLimit } from "../klineShared";

/** Read the existing canonical macro store; no duplicate source adapter or fact writes. */
export async function loadYieldObservations(symbol: string) {
  const instrument = findMarketInstrument(normalizeTickerSymbol(symbol));
  if (!instrument?.fredSeriesId) throw new Error("未找到国债收益率标的");
  const { maps } = await loadFredObservationMapsDbFirst([instrument.fredSeriesId]);
  return [...(maps.get(instrument.fredSeriesId) ?? [])].flatMap(([date, value]) =>
    value != null && Number.isFinite(value) ? [{ time: Date.parse(date) / 1000, value }] : [])
    .sort((a, b) => a.time - b.time);
}

export const macroYieldKlineProvider: KlineMarketDataProvider = {
  id: "fred",
  capabilities: { label: "美联储国债收益率（日度）", supportsExplicitTimeRange: true,
    supportsBeforePagination: true, honorsPriceAdjustment: false },
  isAvailable: () => true,
  async fetch(req) {
    if (!["1d", "1w", "1M"].includes(req.interval)) throw new Error("不支持盘中周期：该收益率为官方日度观测，仅支持日线、周线和月线");
    const symbol = normalizeTickerSymbol(req.symbol);
    let points = await loadYieldObservations(symbol);
    const { beforeTimeSec, fromTimeSec, toTimeSec } = req.window;
    // Bound explicit windows before sampling so a later observation in the same
    // week/month cannot replace the last value actually available at the requested cut.
    points = points.filter(point => (fromTimeSec == null || point.time >= fromTimeSec)
      && (toTimeSec == null || point.time <= toTimeSec));
    if (req.interval === "1w") {
      const weeks = new Map<number, { time: number; value: number }>();
      for (const point of points) {
        const day = new Date(point.time * 1000).getUTCDay();
        const week = point.time - (day === 0 ? 6 : day - 1) * 86400;
        // Sample the last published observation in each week, retaining its actual date.
        weeks.set(week, point);
      }
      points = [...weeks.values()];
    } else if (req.interval === "1M") {
      const months = new Map<number, { time: number; value: number }>();
      for (const point of points) {
        const d = new Date(point.time * 1000);
        const month = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
        // Sample the last published observation in each month, retaining its actual date.
        months.set(month, point);
      }
      points = [...months.values()];
    }
    points = points.filter(point => beforeTimeSec == null || point.time < beforeTimeSec);
    const selected = fromTimeSec != null ? points : points.slice(-clampKlineLimit(req.limit));
    // Close-only compatibility transport for the shared chart's indicators/drawings.
    // observationOnly forces a line; these values never claim to be traded OHLC.
    const sampleNote = req.interval === "1w"
      ? "；周线取每周最后观测值"
      : req.interval === "1M"
        ? "；月线取每月最后观测值"
        : "";
    return { source: "fred", symbol, interval: req.interval, observationOnly: true,
      candles: selected.map(({ time, value }) => ({ time: time as UTCTimestamp,
        open: value, high: value, low: value, close: value })),
      volumeAvailable: false, pricePrecision: 2,
      hasMoreOlder: fromTimeSec == null && points.length > selected.length,
      attribution: `美联储 H.15 / FRED ${findMarketInstrument(symbol)?.fredSeriesId} · 收益率（%）· 官方日度观测，非实时行情、无盘中OHLC · 最新观测：${selected.length ? new Date(Number(selected.at(-1)!.time) * 1000).toISOString().slice(0, 10) : "暂无"}${sampleNote}` };
  },
};
