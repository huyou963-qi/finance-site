import { createHash } from "node:crypto";
import { resolveEastmoneyInstrument } from "./eastmoneySymbols";
import { barMsForInterval, clampKlineLimit, isKlineInterval } from "./klineShared";
import type { KlineFetchRequest, KlineProviderId } from "./providers/klineProviderTypes";
import type { KlinePayload } from "./types";

export const KLINE_CACHE_VERSION = 1;
export const KLINE_CACHE_LEASE_MS = 90_000;
export const KLINE_CACHE_LOAD_TIMEOUT_MS = 60_000;
export const KLINE_CACHE_MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

/** Exact windows preserve each provider's inclusive range/exclusive pagination semantics. */
export function normalizeKlineCacheRequest(id: KlineProviderId, req: KlineFetchRequest): KlineFetchRequest {
  if (!isKlineInterval(req.interval)) throw new Error(`不支持的周期：${req.interval}`);
  const symbol = id === "eastmoney"
    ? resolveEastmoneyInstrument(req.symbol)?.symbol ?? req.symbol.trim().toUpperCase()
    : req.symbol.trim().toUpperCase();
  if (!symbol || symbol.length > 80) throw new Error("无效的股票代码");
  const { beforeTimeSec: before, fromTimeSec: from, toTimeSec: to } = req.window;
  if ((from == null) !== (to == null)) throw new Error("fromSec/toSec 须同时提供");
  if (before != null && from != null) throw new Error("before 与 fromSec/toSec 不能同时使用");
  for (const value of [before, from, to]) {
    if (value != null && (!Number.isSafeInteger(value) || value <= 0 || value > 253402300799)) {
      throw new Error("无效的 K 线时间范围");
    }
  }
  if (from != null && to != null && from >= to) throw new Error("无效的 K 线时间范围");
  return { ...req, symbol, limit: clampKlineLimit(req.limit),
    adjustment: id === "eastmoney" && symbol === "XAUUSD" ? "none" : req.adjustment,
    window: before != null ? { beforeTimeSec: before }
      : from != null ? { fromTimeSec: from, toTimeSec: to } : {} };
}

export function klineCacheKey(id: KlineProviderId, req: KlineFetchRequest): string {
  const normalized = normalizeKlineCacheRequest(id, req);
  // Ordered tuple: equivalent query parameter ordering/aliases share a key.
  return createHash("sha256").update(JSON.stringify([
    KLINE_CACHE_VERSION, id, normalized.symbol, normalized.interval, normalized.adjustment,
    normalized.limit, normalized.window.beforeTimeSec ?? null,
    normalized.window.fromTimeSec ?? null, normalized.window.toTimeSec ?? null,
  ])).digest("hex");
}

export function klineCacheFamily(id: KlineProviderId, req: KlineFetchRequest): string {
  return createHash("sha256").update(JSON.stringify([KLINE_CACHE_VERSION, id, req.symbol, req.interval, req.adjustment])).digest("hex");
}

/** A revision to settled overlapping prices invalidates sibling windows of this instrument/period. */
export function settledKlinePricesChanged(old: KlinePayload | null, next: KlinePayload,
  req: KlineFetchRequest, now: number): boolean {
  if (!old || !isKlineInterval(req.interval)) return false;
  const settledBefore = now / 1000 - barMsForInterval(req.interval) / 1000 - 2 * 86400;
  const previous = new Map(old.candles.map(c => [Number(c.time), c]));
  return next.candles.some(c => {
    const prior = previous.get(Number(c.time));
    return prior && Number(c.time) < settledBefore &&
      (["open", "high", "low", "close"] as const).some(field =>
        Math.abs(prior[field] - c[field]) > Math.max(1e-8, Math.abs(prior[field]) * 1e-10));
  });
}

export function klineCachePolicy(req: KlineFetchRequest, nowMs: number, empty = false) {
  const endSec = req.window.toTimeSec ?? req.window.beforeTimeSec;
  // Leave two days beyond the complete bar boundary for timezone/settlement revisions.
  // No guessed holiday calendar: latest requests always use the short policy.
  const barMs = isKlineInterval(req.interval) ? barMsForInterval(req.interval) : 86400000;
  const historical = endSec != null && endSec * 1000 + barMs + 2 * 86400000 < nowMs;
  const freshMs = empty ? 30_000 : historical
    ? (req.adjustment === "none" ? 6 * 3600000 : 3600000)
    : (["1d", "1w"].includes(req.interval) ? 120_000 : 60_000);
  return { freshMs, hardMs: empty ? 60_000 : historical ? 86400000 : 15 * 60000 };
}

export function klineCacheRetryMs(failures: number): number {
  return Math.min(300_000, 30_000 * 2 ** Math.min(4, Math.max(0, failures - 1)));
}
