import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { clampKlineLimit, isKlineInterval } from "../klineShared";
import { resolveEastmoneyInstrument } from "../eastmoneySymbols";
import type { KlinePayload } from "../types";
import type { KlineFetchRequest, KlineMarketDataProvider } from "./klineProviderTypes";

type Bar = { candle: CandlestickData<UTCTimestamp>; volume: number };
type Response = { rc: number; data?: { name: string; decimal?: number; klines?: string[] } | null };
const pending = new Map<string, Promise<Response>>();
const OFFSET = 8 * 3600;

/** Daily/weekly labels are trading dates; intraday strings are Beijing/HK time. */
export function parseEastmoneyBars(rows: readonly string[], intraday: boolean, volumeScale: number): Bar[] {
  const unique = new Map<number, Bar>();
  for (const row of rows) {
    const [date, o, c, h, l, v] = row.split(",");
    if (!date || !/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/.test(date)) continue;
    const time = Date.parse(intraday ? `${date.replace(" ", "T")}:00+08:00` : `${date}T00:00:00Z`) / 1000;
    const [open, close, high, low] = [o, c, h, l].map(Number);
    if (!Number.isFinite(time) || ![open, close, high, low].every(n => Number.isFinite(n) && n > 0)
      || high < Math.max(open, close) || low > Math.min(open, close)) continue;
    const volume = Number(v);
    unique.set(time, { candle: { time: time as UTCTimestamp, open, close, high, low },
      volume: Number.isFinite(volume) && volume >= 0 ? volume * volumeScale : 0 });
  }
  return [...unique.values()].sort((a, b) => a.candle.time - b.candle.time);
}

/** Group native end-labelled hourly bars into Beijing natural 4-hour buckets. */
export function aggregateEastmoneyFourHours(bars: readonly Bar[]): Bar[] {
  const buckets = new Map<number, Bar>();
  for (const bar of bars) {
    const bucket = Math.floor((bar.candle.time - 1 + OFFSET) / 14400) * 14400 - OFFSET;
    const previous = buckets.get(bucket);
    if (previous) {
      previous.candle.high = Math.max(previous.candle.high, bar.candle.high);
      previous.candle.low = Math.min(previous.candle.low, bar.candle.low);
      previous.candle.close = bar.candle.close;
      previous.volume += bar.volume;
    } else buckets.set(bucket, { candle: { ...bar.candle, time: bucket as UTCTimestamp }, volume: bar.volume });
  }
  return [...buckets.values()];
}

function dateParam(sec: number, intraday: boolean): string {
  return new Date((sec + (intraday ? OFFSET : 0)) * 1000).toISOString().slice(0, 10).replaceAll("-", "");
}

async function getResponse(url: string): Promise<Response> {
  const running = pending.get(url);
  if (running) return running;
  const task = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    if (!response.ok) throw new Error(`东方财富行情暂不可用（HTTP ${response.status}）`);
    const value = await response.json() as Response;
    if (value.rc !== 0) throw new Error("东方财富行情返回异常，请稍后重试");
    return value;
  })();
  pending.set(url, task);
  try { return await task; } finally { pending.delete(url); }
}

export const eastmoneyKlineProvider: KlineMarketDataProvider = {
  id: "eastmoney",
  capabilities: { label: "东方财富", supportsExplicitTimeRange: true, supportsBeforePagination: true, honorsPriceAdjustment: true },
  isAvailable: () => true,
  async fetch(req: KlineFetchRequest): Promise<KlinePayload> {
    const instrument = resolveEastmoneyInstrument(req.symbol);
    if (!instrument) throw new Error("东方财富不支持该标的，请输入现货黄金或完整沪深京港代码");
    if (!isKlineInterval(req.interval)) throw new Error(`不支持的周期：${req.interval}`);
    const intraday = !["1d", "1w"].includes(req.interval);
    const gold = instrument.market === "GOLD";
    const adjustment = gold ? "none" : req.adjustment;
    const limit = clampKlineLimit(req.limit);
    const klt = { "15m": "15", "1h": "60", "4h": "60", "1d": "101", "1w": "102" }[req.interval];
    const { beforeTimeSec: before, fromTimeSec: from, toTimeSec: to } = req.window;
    const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
    // Fetch the available intraday window intact; do not mistake an old request for new history.
    // Daily paging ends before the requested cut; explicit ranges are date-bounded upstream.
    url.search = new URLSearchParams({ secid: instrument.secid, klt,
      fqt: adjustment === "forward" ? "1" : adjustment === "backward" ? "2" : "0",
      beg: from != null && !intraday ? dateParam(from, false) : "19000101",
      end: !intraday && (to != null || before != null) ? dateParam(to ?? before! - 1, false) : "20500101",
      lmt: intraday || from != null ? "10000" : String(limit + 10),
      fields1: "f1,f2,f3,f4,f5,f6", fields2: "f51,f52,f53,f54,f55,f56",
    }).toString();
    const json = await getResponse(url.toString());
    if (!json.data) throw new Error(`未找到标的：${instrument.symbol}`);
    // Mainland equity volumes are lots (100 shares); HK volumes are shares. Gold has no traded volume.
    let bars = parseEastmoneyBars(json.data.klines ?? [], intraday, instrument.market === "HK" || gold ? 1 : 100);
    if (req.interval === "4h") bars = aggregateEastmoneyFourHours(bars);
    const availableFrom = bars[0]?.candle.time;
    const filtered = bars.filter(({ candle }) => (before == null || candle.time < before)
      && (from == null || candle.time >= from) && (to == null || candle.time <= to));
    const page = from != null ? filtered : filtered.slice(-limit);
    const hasMoreOlder = page.length > 0 && filtered.length > page.length;
    const adjustmentLabel = adjustment === "forward" ? "前复权" : adjustment === "backward" ? "后复权" : "不复权";
    return { source: "eastmoney", symbol: instrument.symbol, interval: req.interval,
      candles: page.map(bar => bar.candle), volumes: gold ? undefined : page.map(bar => bar.volume),
      volumeAvailable: !gold, hasMoreOlder, availableFrom,
      pricePrecision: Number.isInteger(json.data.decimal) && json.data.decimal! >= 0 && json.data.decimal! <= 8 ? json.data.decimal : 2,
      attribution: `东方财富 · ${json.data.name} · ${instrument.currency} · ${adjustmentLabel}${gold ? " · 现货无统一成交量" : " · 成交量换算为股"}${intraday ? " · 北京时间 · 分钟历史受上游窗口限制" : " · 交易日期"}${req.interval === "4h" ? " · 4小时按北京时间自然时段聚合" : ""}` };
  },
};
