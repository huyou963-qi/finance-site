/** 全站 K 线周期（各数据源映射到此集合） */
export const KLINE_INTERVALS = ["15m", "1h", "4h", "1d", "1w"] as const;
export type KlineInterval = (typeof KLINE_INTERVALS)[number];

export function isKlineInterval(s: string): s is KlineInterval {
  return (KLINE_INTERVALS as readonly string[]).includes(s);
}

export function clampKlineLimit(n: number): number {
  return Math.min(1000, Math.max(20, Math.floor(Number.isFinite(n) ? n : 300)));
}

/** 与前端首屏 / GET klines 默认 limit、向左分页追加条数一致 */
export const KLINE_PAGE_SIZE = 400;

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

/**
 * 向左分页时传给 API 的 `before`（服务端 cut，过滤 time &lt; cut）。
 * 日线柱常为某日 08:00 UTC；若直接用该时刻作 cut，楔内下一交易日（如 10-14）可能被 IB 挡在窗外。
 * 改为「最早柱所在 UTC 日的次日 00:00」作 exclusive cut。
 */
export function klineExclusiveCutBeforeOldest(
  oldestBarSec: number,
  interval: string,
): number {
  if (!isKlineInterval(interval)) return oldestBarSec;
  if (interval === "1d") {
    const d = new Date(oldestBarSec * 1000);
    const dayStart = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
    );
    return Math.floor(dayStart / 1000) + 86_400;
  }
  if (interval === "1w") {
    return oldestBarSec + Math.floor(barMsForInterval("1w") / 1000);
  }
  return oldestBarSec;
}
