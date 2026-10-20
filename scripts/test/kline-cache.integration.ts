/** Local/production diagnostic: mock loader, real DB leases; only deletes its own generated keys. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { UTCTimestamp } from "lightweight-charts";
import { prisma } from "../../src/lib/prisma";
import { postgresKlineCacheStore as store } from "../../src/lib/data/postgresKlineCacheStore";
import { KlineResponseCache, type KlineCacheRow } from "../../src/lib/data/klineResponseCache";
import { klineCacheKey } from "../../src/lib/data/klineCachePolicy";
import type { KlineFetchRequest } from "../../src/lib/data/providers/klineProviderTypes";
import type { KlinePayload } from "../../src/lib/data/types";

async function main() {
  const now = Date.now();
  const req: KlineFetchRequest = { symbol: `VERIFY_${randomUUID()}`, interval: "4h", limit: 400,
    adjustment: "forward", window: {} };
  const keys = [klineCacheKey("yahoo", req), ...Array.from({ length: 2 }, () => randomUUID().replaceAll("-", ""))];
  const payload: KlinePayload = { source: "yahoo", symbol: req.symbol, interval: "4h",
    candles: [{ time: 1700000000 as UTCTimestamp, open: 10, close: 10, high: 10, low: 10 }],
    volumes: [100], hasMoreOlder: false };
  try {
    const workers = [new KlineResponseCache(store), new KlineResponseCache(store)];
    let loads = 0;
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) => workers[i % 2].fetch("yahoo", req, async () => {
      loads++;
      await new Promise(resolve => setTimeout(resolve, 400));
      return payload;
    })));
    assert.equal(loads, 1, "24 requests / 2 workers must load upstream once");
    assert.equal(results.filter(p => p.cache?.state === "hit").length, 12);
    const restarted = await new KlineResponseCache(store).fetch("yahoo", req, async () => { throw new Error("must hit"); });
    assert.equal(restarted.cache?.state, "hit");
    const key = keys[1];
    assert.equal(await store.claim(key, "old", now - 100000, now - 1), true);
    assert.equal(await store.claim(key, "new", now, now + 90000), true);
    assert.equal(await store.claim(key, "third", now, now + 90000), false);
    const row: KlineCacheRow = { payload, checkedAt: now, freshUntil: now + 60000,
      expiresAt: now + 900000, leaseUntil: 0, retryAfter: 0, failures: 0, error: null };
    assert.equal(await store.publish(key, "old", row, 100, now), false);
    await store.fail(key, "old", "old loader failed", now);
    assert.equal(await store.publish(key, "new", row, 100, now), true);
    assert.equal((await store.read(key))?.payload?.symbol, req.symbol);
    // Failure preserves the existing payload's hard expiry and check timestamp.
    const later = now + 60001;
    assert.equal(await store.claim(key, "retry", later, later + 90000), true);
    await store.fail(key, "retry", "HTTP 429", later);
    const stale = await store.read(key);
    assert.equal(stale?.checkedAt, now);
    assert.equal(stale?.expiresAt, row.expiresAt);
    assert.equal(stale?.retryAfter, later + 30000);
    assert.equal(await store.claim(key, "too-early", later + 1, later + 90000), false);
    assert.equal(await store.claim(keys[2], "active", now, now + 900000, key), true);
    await store.prune(Date.now());
    assert.notEqual(await store.read(keys[2]), null, "cleanup must preserve active lease");
    const revisionTime = later + 30001;
    assert.equal(await store.claim(key, "revision", revisionTime, revisionTime + 90000), true);
    assert.equal(await store.publish(key, "revision", { ...row, checkedAt: revisionTime,
      freshUntil: revisionTime + 60000, expiresAt: revisionTime + 900000 }, 100, revisionTime, true), true);
    assert.equal((await store.read(keys[2]))?.leaseUntil, 0, "family invalidation cancels old in-flight writers");
    assert.equal(await store.publish(keys[2], "active", row, 100, revisionTime), false);
    console.log("PASS: real PostgreSQL concurrency, restart reuse, lease fencing, failure backoff, expiry, cleanup and atomic family invalidation");
  } finally {
    for (const key of keys) await prisma.$executeRaw`DELETE FROM mds.kline_response_cache WHERE key = ${key}`;
    await prisma.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
