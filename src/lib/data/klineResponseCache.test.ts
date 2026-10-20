import assert from "node:assert/strict";
import { it } from "node:test";
import type { UTCTimestamp } from "lightweight-charts";
import { klineCacheKey, klineCachePolicy, normalizeKlineCacheRequest } from "./klineCachePolicy";
import { KlineResponseCache } from "./klineResponseCache";
import { MemoryKlineCacheStore } from "./memoryKlineCacheStore";
import type { KlineFetchRequest } from "./providers/klineProviderTypes";
import type { KlinePayload } from "./types";

const req: KlineFetchRequest = { symbol: "AAPL", interval: "4h", adjustment: "forward", limit: 400, window: {} };
const start = Date.parse("2026-10-11T08:00:00Z");
function payload(close = 10): KlinePayload {
  return { source: "yahoo", symbol: "AAPL", interval: "4h",
    candles: [{ time: 1700000000 as UTCTimestamp, open: close, high: close, low: close, close }],
    volumes: [100], hasMoreOlder: true, attribution: "Yahoo Finance" };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 5));

it("normalizes aliases/casing/limits but isolates source, interval, adjustment and exact windows", () => {
  assert.equal(klineCacheKey("yahoo", req), klineCacheKey("yahoo", { ...req, symbol: " aapl " }));
  assert.equal(klineCacheKey("eastmoney", { ...req, symbol: "SH600000" }),
    klineCacheKey("eastmoney", { ...req, symbol: "600000.SH" }));
  assert.equal(klineCacheKey("eastmoney", { ...req, symbol: "XAU/USD" }),
    klineCacheKey("eastmoney", { ...req, symbol: "XAUUSD", adjustment: "none" }));
  for (const change of [{ interval: "1d" }, { adjustment: "none" as const }, { limit: 300 },
    { window: { beforeTimeSec: 1700000000 } },
    { window: { fromTimeSec: 1600000000, toTimeSec: 1700000000 } }]) {
    assert.notEqual(klineCacheKey("yahoo", req), klineCacheKey("yahoo", { ...req, ...change }));
  }
  assert.notEqual(klineCacheKey("yahoo", req), klineCacheKey("eastmoney", req));
  assert.equal(normalizeKlineCacheRequest("yahoo", { ...req, limit: NaN }).limit, 300);
  assert.throws(() => normalizeKlineCacheRequest("yahoo", { ...req, interval: "monthly" }), /不支持/);
  assert.throws(() => normalizeKlineCacheRequest("yahoo", { ...req, window: { fromTimeSec: 1 } }), /同时/);
  assert.throws(() => normalizeKlineCacheRequest("yahoo", { ...req, window: { beforeTimeSec: Infinity } }), /无效/);
});

it("keeps unfinished daily/4h/weekly bars short-lived, historical adjusted data revisable, empty pages short", () => {
  assert.equal(klineCachePolicy(req, start).freshMs, 60000);
  assert.equal(klineCachePolicy({ ...req, interval: "1d" }, start).freshMs, 120000);
  const currentWeek = { ...req, interval: "1w", window: { toTimeSec: start / 1000 - 3 * 86400 } };
  assert.equal(klineCachePolicy(currentWeek, start).freshMs, 120000);
  const history = { ...req, window: { beforeTimeSec: start / 1000 - 30 * 86400 } };
  assert.equal(klineCachePolicy(history, start).freshMs, 3600000);
  assert.equal(klineCachePolicy({ ...history, adjustment: "none" }, start).freshMs, 21600000);
  assert.equal(klineCachePolicy(history, start).hardMs, 86400000);
  assert.deepEqual(klineCachePolicy(history, start, true), { freshMs: 30000, hardMs: 60000 });
});

it("coalesces 40 cold requests and reuses persisted data after a cache instance restart", async () => {
  const store = new MemoryKlineCacheStore();
  const cache = new KlineResponseCache(store, () => start);
  const gate = deferred<KlinePayload>();
  let loads = 0;
  const load = () => { loads++; return gate.promise; };
  const requests = Array.from({ length: 40 }, () => cache.fetch("yahoo", req, load));
  await tick();
  assert.equal(loads, 1);
  gate.resolve(payload());
  const results = await Promise.all(requests);
  assert.equal(results[0].cache?.state, "refreshed");
  const restarted = new KlineResponseCache(store, () => start + 1);
  const hit = await restarted.fetch("yahoo", req, load);
  assert.equal(hit.cache?.state, "hit");
  assert.equal(loads, 1);
  assert.equal(hit.hasMoreOlder, true);
  assert.deepEqual(hit.volumes, [100]);
});

it("shared store coalesces separate worker instances; cold waiters read the winning result", async () => {
  const store = new MemoryKlineCacheStore();
  const a = new KlineResponseCache(store, () => start, tick);
  const b = new KlineResponseCache(store, () => start, tick);
  const gate = deferred<KlinePayload>();
  let loads = 0;
  const load = () => { loads++; return gate.promise; };
  const pa = a.fetch("yahoo", req, load);
  const pb = b.fetch("yahoo", req, load);
  await tick();
  gate.resolve(payload());
  const results = await Promise.all([pa, pb]);
  assert.equal(loads, 1);
  assert.deepEqual(results.map(p => p.cache?.state).sort(), ["hit", "refreshed"]);
});

it("refreshes after soft TTL; failure backoff protects upstream and never extends hard expiry", async () => {
  let now = start;
  const store = new MemoryKlineCacheStore();
  const cache = new KlineResponseCache(store, () => now);
  let loads = 0;
  await cache.fetch("yahoo", req, async () => { loads++; return payload(); });
  now += 60001;
  const failed = async () => { loads++; throw new Error("HTTP 429"); };
  const stale = await cache.fetch("yahoo", req, failed);
  assert.equal(stale.cache?.state, "stale");
  assert.match(stale.attribution!, /刷新失败/);
  assert.equal(stale.cache?.checkedAt, new Date(start).toISOString());
  await cache.fetch("yahoo", req, failed);
  assert.equal(loads, 2);
  now += 30001;
  const updated = await cache.fetch("yahoo", req, async () => { loads++; return payload(11); });
  assert.equal(updated.cache?.state, "refreshed");
  assert.equal(updated.candles[0].close, 11);
  now += 15 * 60000 + 1;
  await assert.rejects(cache.fetch("yahoo", req, failed), /429/);
  const count = loads;
  await assert.rejects(cache.fetch("yahoo", req, failed), /429/);
  assert.equal(loads, count);
});

it("old refresh finishing after lease takeover cannot overwrite the newer result", async () => {
  let now = start;
  const store = new MemoryKlineCacheStore();
  const a = new KlineResponseCache(store, () => now);
  const b = new KlineResponseCache(store, () => now);
  const old = deferred<KlinePayload>();
  const pa = a.fetch("yahoo", req, () => old.promise);
  await tick();
  now += 90001;
  const fresh = await b.fetch("yahoo", req, async () => payload(12));
  old.resolve(payload(9));
  const late = await pa;
  assert.equal(fresh.candles[0].close, 12);
  assert.equal(late.candles[0].close, 12);
  assert.equal((await store.read(klineCacheKey("yahoo", req)))?.payload?.candles[0].close, 12);
});

it("source timeout releases lease, records retry cooldown, and late load cannot publish", async () => {
  const store = new MemoryKlineCacheStore();
  const cache = new KlineResponseCache(store, () => start, tick, 15);
  const slow = deferred<KlinePayload>();
  await assert.rejects(cache.fetch("yahoo", req, () => slow.promise), /超时/);
  slow.resolve(payload());
  await tick();
  const row = await store.read(klineCacheKey("yahoo", req));
  assert.equal(row?.payload, null);
  assert.equal(row?.leaseUntil, 0);
  assert.equal(row?.retryAfter, start + 30000);
});

it("empty pagination remains empty and expires promptly instead of becoming fake history", async () => {
  let now = start;
  const cache = new KlineResponseCache(new MemoryKlineCacheStore(), () => now);
  let loads = 0;
  const load = async () => { loads++; return { ...payload(), candles: [], volumes: [], hasMoreOlder: false }; };
  const page = await cache.fetch("yahoo", { ...req, window: { beforeTimeSec: 1 } }, load);
  assert.equal(page.hasMoreOlder, false);
  now += 20000;
  await cache.fetch("yahoo", { ...req, window: { beforeTimeSec: 1 } }, load);
  assert.equal(loads, 1);
  now += 11000;
  await cache.fetch("yahoo", { ...req, window: { beforeTimeSec: 1 } }, load);
  assert.equal(loads, 2);
});

it("fresh cache of another window/adjustment cannot satisfy this request", async () => {
  const cache = new KlineResponseCache(new MemoryKlineCacheStore(), () => start);
  let loads = 0;
  const load = async () => { loads++; return payload(); };
  await cache.fetch("yahoo", req, load);
  await cache.fetch("yahoo", { ...req, adjustment: "none" }, load);
  await cache.fetch("yahoo", { ...req, window: { beforeTimeSec: 1700000000 } }, load);
  assert.equal(loads, 3);
});

it("settled price revisions invalidate sibling history caches; forming bars and other adjustments stay isolated", async () => {
  let now = start;
  const store = new MemoryKlineCacheStore();
  const cache = new KlineResponseCache(store, () => now);
  const history = { ...req, window: { beforeTimeSec: 1700000001 } };
  await cache.fetch("yahoo", req, async () => payload());
  await cache.fetch("yahoo", history, async () => payload());
  const otherAdjustment = { ...history, adjustment: "none" as const };
  await cache.fetch("yahoo", otherAdjustment, async () => payload());
  now += 60001;
  await cache.fetch("yahoo", req, async () => payload(12));
  assert.equal(await store.read(klineCacheKey("yahoo", history)), null);
  assert.notEqual(await store.read(klineCacheKey("yahoo", otherAdjustment)), null);
  let loads = 0;
  await cache.fetch("yahoo", history, async () => { loads++; return payload(12); });
  assert.equal(loads, 1);
});

it("ordinary live-bar updates do not invalidate settled historical pages", async () => {
  let now = start;
  const store = new MemoryKlineCacheStore();
  const cache = new KlineResponseCache(store, () => now);
  const live = (close: number) => ({ ...payload(close), candles: [{ ...payload(close).candles[0], time: (start / 1000) as UTCTimestamp }] });
  const history = { ...req, window: { beforeTimeSec: 1700000001 } };
  await cache.fetch("yahoo", req, async () => live(10));
  await cache.fetch("yahoo", history, async () => payload());
  now += 60001;
  await cache.fetch("yahoo", req, async () => live(11));
  assert.notEqual(await store.read(klineCacheKey("yahoo", history)), null);
});
