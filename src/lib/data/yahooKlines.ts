import YahooFinance from "yahoo-finance2";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import type { KlinePayload } from "./types";
import {
  clampKlineLimit,
  isKlineInterval,
  lookbackMs,
  type KlineInterval,
} from "./klineShared";
import { normalizeYahooSymbol } from "./yahooSymbol";

const yahooFinance = new YahooFinance();

/** 允许常见美股 / 指数 / 加密 / 国际代码（Yahoo 符号） */
const YAHOO_SYMBOL_RE = /^[\^A-Za-z0-9.\-]{1,64}$/;

function aggregate1hTo4h(
  hourly: CandlestickData[],
  volumes: number[],
): { candles: CandlestickData[]; volumes: number[] } {
  const outC: CandlestickData[] = [];
  const outV: number[] = [];
  for (let i = 0; i + 3 < hourly.length; i += 4) {
    const chunk = hourly.slice(i, i + 4);
    const vChunk = volumes.slice(i, i + 4);
    const open = chunk[0].open;
    const close = chunk[3].close;
    let high = chunk[0].high;
    let low = chunk[0].low;
    for (const c of chunk) {
      high = Math.max(high, c.high);
      low = Math.min(low, c.low);
    }
    outC.push({
      time: chunk[0].time,
      open,
      high,
      low,
      close,
    });
    outV.push(vChunk.reduce((a, b) => a + b, 0));
  }
  return { candles: outC, volumes: outV };
}

/** 与 Python yfinance 同源：Yahoo Finance（经 yahoo-finance2） */
export async function fetchYahooKlines(
  symbolRaw: string,
  intervalRaw: string,
  limitRaw: number,
): Promise<KlinePayload> {
  const symbol = normalizeYahooSymbol(symbolRaw);
  if (!YAHOO_SYMBOL_RE.test(symbol)) {
    throw new Error("无效的 Yahoo 代码（例如 AAPL、^GSPC、BTC-USD）");
  }

  if (!isKlineInterval(intervalRaw)) {
    throw new Error(`interval 必须为之一：15m, 1h, 4h, 1d, 1w`);
  }
  const interval = intervalRaw as KlineInterval;
  const limit = clampKlineLimit(limitRaw);

  const period2 = new Date();
  const needHourly = interval === "4h";
  const hourlyLimit = needHourly ? Math.min(1000, limit * 4 + 24) : limit;
  const lookback = needHourly
    ? lookbackMs("1h", hourlyLimit)
    : lookbackMs(interval, limit);
  const period1 = new Date(period2.getTime() - lookback);

  type YahooIv =
    | "15m"
    | "1h"
    | "1d"
    | "1wk";
  let yahooInterval: YahooIv = "1d";
  let extraNote = "";

  if (interval === "15m") yahooInterval = "15m";
  else if (interval === "1h") yahooInterval = "1h";
  else if (interval === "4h") {
    yahooInterval = "1h";
    extraNote = "（Yahoo 无原生 4h，已由 1h 合成）";
  } else if (interval === "1d") yahooInterval = "1d";
  else if (interval === "1w") yahooInterval = "1wk";

  const result = await yahooFinance.chart(symbol, {
    period1,
    period2,
    interval: yahooInterval,
    return: "array",
  });

  const quotes = result.quotes ?? [];
  const candles: CandlestickData[] = [];
  const volumes: number[] = [];
  for (const q of quotes) {
    if (
      q.open == null ||
      q.high == null ||
      q.low == null ||
      q.close == null
    ) {
      continue;
    }
    const sec = Math.floor(q.date.getTime() / 1000) as UTCTimestamp;
    candles.push({
      time: sec,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
    });
    const v =
      q.volume != null && Number.isFinite(q.volume) ? (q.volume as number) : 0;
    volumes.push(v);
  }

  if (candles.length === 0) {
    throw new Error("Yahoo 未返回有效 K 线（代码或区间是否有效）");
  }

  let outC = candles;
  let outV = volumes;
  if (needHourly) {
    const ag = aggregate1hTo4h(candles, volumes);
    outC = ag.candles;
    outV = ag.volumes;
    outC = outC.slice(-limit);
    outV = outV.slice(-limit);
  } else {
    outC = candles.slice(-limit);
    outV = volumes.slice(-limit);
  }

  return {
    source: "yahoo",
    symbol,
    interval,
    candles: outC,
    volumes: outV,
    attribution: `Yahoo Finance（Node: yahoo-finance2，与 Python yfinance 同源）${extraNote}。日内 K 线历史长度受 Yahoo 限制。`,
  };
}
