import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import type { KlinePayload } from "./types";
import {
  clampKlineLimit,
  isKlineInterval,
  lookbackMs,
  type KlineInterval,
} from "./klineShared";

/** Massive 标的：美股 AAPL、加密 X:BTCUSD 等 */
const MASSIVE_TICKER_RE = /^[A-Z0-9][A-Z0-9.\-:]{0,62}$/i;

type MassiveSpan = { multiplier: number; timespan: "minute" | "hour" | "day" | "week" };

function intervalToMassive(i: KlineInterval): MassiveSpan {
  switch (i) {
    case "15m":
      return { multiplier: 15, timespan: "minute" };
    case "1h":
      return { multiplier: 1, timespan: "hour" };
    case "4h":
      return { multiplier: 4, timespan: "hour" };
    case "1d":
      return { multiplier: 1, timespan: "day" };
    case "1w":
      return { multiplier: 1, timespan: "week" };
    default:
      return { multiplier: 1, timespan: "day" };
  }
}

function massiveApiKey(): string {
  const key = process.env.MASSIVE_API_KEY?.trim();
  if (!key) {
    throw new Error("未配置环境变量 MASSIVE_API_KEY");
  }
  return key;
}

/** Massive Aggregates v2（需 MASSIVE_API_KEY；REST 基址 api.massive.com） */
export async function fetchMassiveKlines(
  tickerRaw: string,
  intervalRaw: string,
  limitRaw: number,
): Promise<KlinePayload> {
  const key = massiveApiKey();

  const ticker = tickerRaw.trim().toUpperCase();
  if (!MASSIVE_TICKER_RE.test(ticker)) {
    throw new Error("无效的 Massive 代码（如 AAPL、X:BTCUSD）");
  }

  if (!isKlineInterval(intervalRaw)) {
    throw new Error(`interval 必须为之一：15m, 1h, 4h, 1d, 1w`);
  }
  const interval = intervalRaw as KlineInterval;
  const limit = clampKlineLimit(limitRaw);

  const to = new Date();
  const from = new Date(to.getTime() - lookbackMs(interval, limit));
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const { multiplier, timespan } = intervalToMassive(interval);
  const url = new URL(
    `https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${fromStr}/${toStr}`,
  );
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", String(Math.min(50000, limit + 100)));
  url.searchParams.set("apiKey", key);

  const res = await fetch(url.toString(), { next: { revalidate: 60 } });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Massive HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    status?: string;
    results?: Array<{
      t: number;
      o: number;
      h: number;
      l: number;
      c: number;
      v?: number;
    }>;
    error?: string;
  };

  if (data.error) {
    throw new Error(data.error);
  }

  const rows = data.results ?? [];
  if (rows.length === 0) {
    throw new Error("Massive 无返回数据（代码、日期区间或权限是否有效）");
  }

  const candles: CandlestickData[] = [];
  const volumes: number[] = [];
  for (const r of rows) {
    candles.push({
      time: Math.floor(r.t / 1000) as UTCTimestamp,
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
    });
    volumes.push(r.v != null && Number.isFinite(r.v) ? r.v : 0);
  }

  const sliced = candles.slice(-limit);
  const volSliced = volumes.slice(-limit);

  return {
    source: "massive",
    symbol: ticker,
    interval,
    candles: sliced,
    volumes: volSliced,
    attribution:
      "Massive Aggregates API（需订阅；美国行情遵守交易所延迟规则）。",
  };
}
