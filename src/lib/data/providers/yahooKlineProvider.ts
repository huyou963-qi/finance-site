import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import {
  getAdjustedDailyBars,
  normalizeSymbol,
} from "@/lib/equity/equityPriceStore";
import type { AdjustedBar } from "@/lib/equity/priceAdjustment";
import { fetchYahooChart, YahooSymbolNotFoundError } from "@/lib/equity/yahooChart";
import { KLINE_PAGE_SIZE } from "@/lib/data/klineShared";
import type {
  KlineFetchRequest,
  KlineMarketDataProvider,
  KlineProviderCapabilities,
} from "@/lib/data/providers/klineProviderTypes";
import type { KlinePayload } from "@/lib/data/types";

const DAY_SEC = 86400;

const capabilities: KlineProviderCapabilities = {
  label: "Yahoo Finance（美股）",
  supportsExplicitTimeRange: true,
  supportsBeforePagination: true,
  // 日线/周线由服务端按 EquitySplit + adjClose 精确复权
  honorsPriceAdjustment: true,
};

/** 站内周期 → Yahoo interval；null 表示需由更细周期聚合 */
const YAHOO_INTERVAL: Record<string, string | null> = {
  "15m": "15m",
  "1h": "1h",
  "4h": null, // 由 1h 聚合
  "1d": "1d", // 走本地库
  "1w": null, // 由日线聚合
};

function isDailyBacked(interval: string): boolean {
  return interval === "1d" || interval === "1w";
}

// ------------------------------------------------------------ 聚合

type Bucketed = { bar: AdjustedBar; volume: number | null };

/** 把升序 bars 按 bucketKey 归并为更粗周期（O=首根开，C=末根收，H/L 取极值，V 求和） */
function aggregate(
  bars: readonly AdjustedBar[],
  bucketKey: (timeSec: number) => number,
): AdjustedBar[] {
  const out: AdjustedBar[] = [];
  let cur: Bucketed | null = null;
  let curKey = NaN;

  const flush = () => {
    if (cur) out.push({ ...cur.bar, volume: cur.volume });
  };

  for (const b of bars) {
    const key = bucketKey(b.time);
    if (cur == null || key !== curKey) {
      flush();
      curKey = key;
      cur = { bar: { ...b, time: key }, volume: b.volume };
      continue;
    }
    const acc = cur.bar;
    acc.high = maxOf(acc.high, b.high);
    acc.low = minOf(acc.low, b.low);
    acc.close = b.close;
    cur.volume = addOf(cur.volume, b.volume);
  }
  flush();
  return out;
}

function maxOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}
function minOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}
function addOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return a + b;
}

/** 周线桶：所在周的周一 UTC 零点 */
function weekStartSec(timeSec: number): number {
  const day = Math.floor(timeSec / DAY_SEC) * DAY_SEC;
  const dow = new Date(day * 1000).getUTCDay(); // 0=周日
  const offset = dow === 0 ? 6 : dow - 1;
  return day - offset * DAY_SEC;
}

/** 4 小时桶（按 UTC 对齐） */
function fourHourStartSec(timeSec: number): number {
  const step = 4 * 3600;
  return Math.floor(timeSec / step) * step;
}

// ------------------------------------------------------------ 转换

function toCandles(bars: readonly AdjustedBar[]): {
  candles: CandlestickData[];
  volumes: number[];
} {
  const candles: CandlestickData[] = [];
  const volumes: number[] = [];
  for (const b of bars) {
    const close = b.close;
    // 兜底丢弃脏 bar（如盘中周期 Yahoo 节假日占位帧）：close 非正/非有限会污染指标
    if (!Number.isFinite(close) || close <= 0) continue;
    const leg = (v: number | null | undefined): number =>
      v != null && Number.isFinite(v) && v > 0 ? v : close;
    candles.push({
      time: b.time as UTCTimestamp,
      open: leg(b.open),
      high: leg(b.high),
      low: leg(b.low),
      close,
    });
    volumes.push(b.volume ?? 0);
  }
  return { candles, volumes };
}

function sliceWindow(
  bars: AdjustedBar[],
  req: KlineFetchRequest,
): { page: AdjustedBar[]; hasMoreOlder: boolean } {
  const { beforeTimeSec, fromTimeSec, toTimeSec } = req.window;
  let filtered = bars;

  if (fromTimeSec != null && toTimeSec != null) {
    filtered = bars.filter((b) => b.time >= fromTimeSec && b.time <= toTimeSec);
    const hasMoreOlder = bars.length > 0 && bars[0]!.time < (filtered[0]?.time ?? fromTimeSec);
    return { page: filtered, hasMoreOlder };
  }

  if (beforeTimeSec != null) {
    filtered = bars.filter((b) => b.time < beforeTimeSec);
  }

  const page = req.limit > 0 ? filtered.slice(-req.limit) : filtered;
  const hasMoreOlder = page.length > 0 && filtered.length > page.length;
  return { page, hasMoreOlder };
}

// ------------------------------------------------------------ 盘中

async function fetchIntraday(req: KlineFetchRequest): Promise<AdjustedBar[]> {
  const needs1h = req.interval === "4h";
  const yInterval = needs1h ? "1h" : YAHOO_INTERVAL[req.interval];
  if (!yInterval) throw new Error(`不支持的周期：${req.interval}`);

  const { beforeTimeSec, fromTimeSec, toTimeSec } = req.window;
  const nowSec = Math.floor(Date.now() / 1000);
  // Yahoo 盘中历史窗口：15m 最多 60 天，1h 最多 730 天
  const maxSpanSec = yInterval === "15m" ? 59 * DAY_SEC : 720 * DAY_SEC;

  let period2 = toTimeSec ?? beforeTimeSec ?? nowSec;
  let period1 = fromTimeSec ?? period2 - maxSpanSec;
  if (period2 - period1 > maxSpanSec) period1 = period2 - maxSpanSec;
  if (period1 < nowSec - maxSpanSec) period1 = nowSec - maxSpanSec;
  if (period1 >= period2) period2 = period1 + DAY_SEC;

  const chart = await fetchYahooChart(req.symbol, {
    period1,
    period2,
    interval: yInterval,
  });

  const bars: AdjustedBar[] = chart.bars.map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

  return needs1h ? aggregate(bars, fourHourStartSec) : bars;
}

// ------------------------------------------------------------ Provider

export const yahooKlineProvider: KlineMarketDataProvider = {
  id: "yahoo",
  capabilities,
  isAvailable: () => true,

  async fetch(req: KlineFetchRequest): Promise<KlinePayload> {
    const symbol = normalizeSymbol(req.symbol);
    if (!symbol) throw new Error("symbol 不能为空");

    try {
      if (isDailyBacked(req.interval)) {
        // 日线/周线：本地库 + 服务端精确复权（全历史一次算，保证后复权锚点稳定）
        const { bars, found, source } = await getAdjustedDailyBars(symbol, {
          mode: req.adjustment,
        });
        if (!found) throw new YahooSymbolNotFoundError(symbol);

        const series = req.interval === "1w" ? aggregate(bars, weekStartSec) : bars;
        const { page, hasMoreOlder } = sliceWindow(series, req);
        const { candles, volumes } = toCandles(page);

        return {
          source: "yahoo",
          symbol,
          interval: req.interval,
          candles,
          volumes,
          attribution: `Yahoo Finance · ${adjustmentLabel(req.adjustment)}（数据源：${source ?? "yahoo"}，本地缓存）`,
          hasMoreOlder,
        };
      }

      // 盘中周期：实时取 Yahoo，不入库
      const bars = await fetchIntraday(req);
      const { page, hasMoreOlder } = sliceWindow(bars, {
        ...req,
        // 盘中已按窗口取回，避免二次 before 过滤把整页滤空
        window: req.window.beforeTimeSec != null ? req.window : {},
      });
      const { candles, volumes } = toCandles(page);

      return {
        source: "yahoo",
        symbol,
        interval: req.interval,
        candles,
        volumes,
        attribution:
          "Yahoo Finance · 盘中周期为拆股调整价（不含分红复权），历史窗口受限（15m≤60天，1h≤730天）",
        hasMoreOlder: hasMoreOlder && page.length >= KLINE_PAGE_SIZE,
      };
    } catch (e) {
      if (e instanceof YahooSymbolNotFoundError) {
        throw new Error(`未找到标的：${symbol}`);
      }
      throw e;
    }
  },
};

function adjustmentLabel(mode: KlineFetchRequest["adjustment"]): string {
  if (mode === "backward") return "后复权";
  if (mode === "none") return "不复权（名义成交价）";
  return "前复权";
}
