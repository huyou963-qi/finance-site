/** 全站 K 线周期（Binance / Yahoo / Massive 映射到此集合） */
export const KLINE_INTERVALS = ["15m", "1h", "4h", "1d", "1w"] as const;
export type KlineInterval = (typeof KLINE_INTERVALS)[number];

export function isKlineInterval(s: string): s is KlineInterval {
  return (KLINE_INTERVALS as readonly string[]).includes(s);
}

export function clampKlineLimit(n: number): number {
  return Math.min(1000, Math.max(20, Math.floor(Number.isFinite(n) ? n : 300)));
}

export function barMsForInterval(i: KlineInterval): number {
  switch (i) {
    case "15m":
      return 15 * 60 * 1000;
    case "1h":
      return 60 * 60 * 1000;
    case "4h":
      return 4 * 60 * 60 * 1000;
    case "1d":
      return 24 * 60 * 60 * 1000;
    case "1w":
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

/** 估算 period1 回溯时长（略放大以覆盖非交易日） */
export function lookbackMs(interval: KlineInterval, limit: number): number {
  const base = barMsForInterval(interval) * limit * 1.25;
  return Math.max(base, 7 * 24 * 60 * 60 * 1000);
}
