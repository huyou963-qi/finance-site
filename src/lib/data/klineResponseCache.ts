import { randomUUID } from "node:crypto";
import {
  KLINE_CACHE_LEASE_MS, KLINE_CACHE_LOAD_TIMEOUT_MS, KLINE_CACHE_MAX_PAYLOAD_BYTES,
  klineCacheKey, klineCacheFamily, klineCachePolicy, normalizeKlineCacheRequest, settledKlinePricesChanged,
} from "./klineCachePolicy";
import type { KlineFetchRequest, KlineProviderId } from "./providers/klineProviderTypes";
import type { KlinePayload } from "./types";

export type KlineCacheRow = {
  payload: KlinePayload | null;
  checkedAt: number;
  freshUntil: number;
  expiresAt: number;
  retryAfter: number;
  leaseUntil: number;
  failures: number;
  error: string | null;
};

/** Each mutation must be atomic; publish/fail are fenced by owner and lease expiry. */
export interface KlineCacheStore {
  read(key: string): Promise<KlineCacheRow | null>;
  touch(key: string, now: number): Promise<void>;
  claim(key: string, owner: string, now: number, leaseUntil: number, family?: string): Promise<boolean>;
  publish(key: string, owner: string, row: KlineCacheRow, bytes: number, now: number, invalidateFamily?: boolean): Promise<boolean>;
  fail(key: string, owner: string, error: string, now: number): Promise<void>;
  prune(now: number): Promise<void>;
}

function cachePayload(row: KlineCacheRow, state: "hit" | "refreshed" | "stale"): KlinePayload {
  const payload = row.payload!;
  return { ...payload, cache: { state, checkedAt: new Date(row.checkedAt).toISOString(),
    freshUntil: new Date(row.freshUntil).toISOString(), expiresAt: new Date(row.expiresAt).toISOString() },
    ...(state === "stale" ? { attribution: `行情刷新失败，暂用缓存（检查于 ${new Date(row.checkedAt).toISOString()}） · ${payload.attribution ?? ""}` } : {}) };
}

export class KlineResponseCache {
  private pending = new Map<string, Promise<KlinePayload>>();
  private maintenanceAt = 0;
  constructor(private store: KlineCacheStore, private now = Date.now,
    private sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
    private timeoutMs = KLINE_CACHE_LOAD_TIMEOUT_MS) {}

  async fetch(id: KlineProviderId, request: KlineFetchRequest,
    load: (req: KlineFetchRequest) => Promise<KlinePayload>): Promise<KlinePayload> {
    const req = normalizeKlineCacheRequest(id, request);
    const key = klineCacheKey(id, req);
    const running = this.pending.get(key);
    if (running) return running;
    if (this.pending.size >= 256) throw new Error("行情请求繁忙，请稍后重试");
    const task = this.resolve(key, klineCacheFamily(id, req), req, load);
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }

  private async resolve(key: string, family: string, req: KlineFetchRequest,
    load: (req: KlineFetchRequest) => Promise<KlinePayload>): Promise<KlinePayload> {
    const started = this.now();
    if (started >= this.maintenanceAt) {
      this.maintenanceAt = started + 60_000;
      // Cleanup errors do not invalidate an otherwise readable cache.
      await this.store.prune(started).catch(e => console.warn("[kline-cache] cleanup failed", String(e)));
    }
    const owner = randomUUID();
    for (;;) {
      const now = this.now();
      const row = await this.store.read(key);
      if (row?.payload && row.freshUntil > now && row.expiresAt > now) {
        await this.store.touch(key, now);
        return cachePayload(row, "hit");
      }
      if (row && row.retryAfter > now) {
        if (row.payload && row.expiresAt > now) {
          await this.store.touch(key, now);
          return cachePayload(row, "stale");
        }
        throw new Error(row.error ?? "行情源暂不可用，请稍后重试");
      }
      if (await this.store.claim(key, owner, now, now + KLINE_CACHE_LEASE_MS, family)) {
        return this.refresh(key, owner, req, load, row?.payload ?? null);
      }
      // Other workers refresh too: stale readers can return immediately, cold readers wait.
      if (row?.payload && row.expiresAt > now) {
        await this.store.touch(key, now);
        return { ...cachePayload(row, "stale"),
          attribution: `行情更新中，暂用缓存（检查于 ${new Date(row.checkedAt).toISOString()}） · ${row.payload.attribution ?? ""}` };
      }
      if (now - started >= this.timeoutMs) throw new Error("行情更新等待超时，请稍后重试");
      await this.sleep(250);
    }
  }

  private async refresh(key: string, owner: string, req: KlineFetchRequest,
    load: (req: KlineFetchRequest) => Promise<KlinePayload>, previous: KlinePayload | null): Promise<KlinePayload> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const payload = await Promise.race([load(req), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("行情源请求超时，请稍后重试")), this.timeoutMs);
      })]);
      // Metadata is per delivery; never persist an old hit/stale marker.
      const clean = { ...payload };
      delete clean.cache;
      const bytes = Buffer.byteLength(JSON.stringify(clean));
      if (bytes > KLINE_CACHE_MAX_PAYLOAD_BYTES) throw new Error("K 线时间范围过大，请缩小范围");
      const now = this.now();
      const policy = klineCachePolicy(req, now, clean.candles.length === 0);
      const row: KlineCacheRow = { payload: clean, checkedAt: now,
        freshUntil: now + policy.freshMs, expiresAt: now + policy.hardMs,
        retryAfter: 0, leaseUntil: 0, failures: 0, error: null };
      const saved = await this.store.publish(key, owner, row, bytes, now,
        settledKlinePricesChanged(previous, clean, req, now) ||
        (!previous && req.window.beforeTimeSec == null && req.window.toTimeSec == null));
      if (saved) return cachePayload(row, "refreshed");
      // Lease takeover happened: the old loader must never overwrite the new owner.
      const newer = await this.store.read(key);
      if (newer?.payload && newer.expiresAt > now) return cachePayload(newer, newer.freshUntil > now ? "hit" : "stale");
      throw new Error("行情刷新锁已超时，请重试");
    } catch (e) {
      const message = e instanceof Error ? e.message : "行情源暂不可用";
      const now = this.now();
      await this.store.fail(key, owner, message, now);
      const row = await this.store.read(key);
      if (row?.payload && row.expiresAt > now) return cachePayload(row, "stale");
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  }
}
