import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { clampKlineLimit, isKlineInterval } from "./klineShared";
import type { KlinePayload } from "./types";

/** Binance 公开 REST K 线，无需 API Key（现货）。文档：https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data */
export async function fetchBinanceSpotKlines(
  symbolRaw: string,
  intervalRaw: string,
  limitRaw: number,
): Promise<KlinePayload> {
  const symbol = symbolRaw.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,20}$/.test(symbol)) {
    throw new Error("无效的 symbol（仅字母数字，如 BTCUSDT）");
  }

  if (!isKlineInterval(intervalRaw)) {
    throw new Error("interval 必须为之一：15m, 1h, 4h, 1d, 1w");
  }
  const interval = intervalRaw;

  const limit = clampKlineLimit(limitRaw);

  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;

  const res = await fetch(url, { next: { revalidate: 120 } });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Binance HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Binance: unexpected klines shape");
  }

  const candles: CandlestickData[] = [];
  const volumes: number[] = [];
  for (const row of data) {
    const r = row as unknown[];
    const openTime = Number(r[0]);
    const open = parseFloat(String(r[1]));
    const high = parseFloat(String(r[2]));
    const low = parseFloat(String(r[3]));
    const close = parseFloat(String(r[4]));
    const vol = parseFloat(String(r[5] ?? 0)) || 0;
    candles.push({
      time: Math.floor(openTime / 1000) as UTCTimestamp,
      open,
      high,
      low,
      close,
    });
    volumes.push(vol);
  }

  return {
    source: "binance",
    symbol,
    interval,
    candles,
    volumes,
    attribution: "Binance 公开行情接口（演示用途；生产请评估合规与条款）",
  };
}
