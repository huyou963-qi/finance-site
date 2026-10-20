import { prisma } from "@/lib/prisma";
import type { KlineCacheRow, KlineCacheStore } from "./klineResponseCache";
import type { KlinePayload } from "./types";

type DbRow = { payload: KlinePayload | null; checked_at: Date; fresh_until: Date;
  expires_at: Date; retry_after: Date; lease_until: Date; failures: number; error: string | null };

/** Short SQL statements only; no transaction/connection held while waiting on upstream HTTP. */
const store: KlineCacheStore = {
  async read(key) {
    const rows = await prisma.$queryRaw<DbRow[]>`
      SELECT payload, checked_at, fresh_until, expires_at, retry_after, lease_until, failures, error
      FROM mds.kline_response_cache WHERE key = ${key}`;
    const row = rows[0];
    return row ? { payload: row.payload, checkedAt: row.checked_at.getTime(),
      freshUntil: row.fresh_until.getTime(), expiresAt: row.expires_at.getTime(),
      retryAfter: row.retry_after.getTime(), leaseUntil: row.lease_until.getTime(),
      failures: row.failures, error: row.error } satisfies KlineCacheRow : null;
  },
  async touch(key, now) {
    // Throttle writes for popular symbols: hits still require only a small indexed read.
    await prisma.$executeRaw`UPDATE mds.kline_response_cache SET last_access_at = ${new Date(now)}
      WHERE key = ${key} AND last_access_at < ${new Date(now - 60_000)}`;
  },
  async claim(key, owner, now, leaseUntil, family = key) {
    const rows = await prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO mds.kline_response_cache (key, family_key, lease_owner, lease_until, expires_at, last_access_at)
      VALUES (${key}, ${family}, ${owner}, ${new Date(leaseUntil)}, ${new Date(leaseUntil)}, ${new Date(now)})
      ON CONFLICT (key) DO UPDATE SET lease_owner = EXCLUDED.lease_owner,
        lease_until = EXCLUDED.lease_until, last_access_at = EXCLUDED.last_access_at, family_key = EXCLUDED.family_key
      WHERE mds.kline_response_cache.lease_until <= ${new Date(now)}
        AND mds.kline_response_cache.retry_after <= ${new Date(now)}
        AND mds.kline_response_cache.fresh_until <= ${new Date(now)}
      RETURNING key`;
    return rows.length === 1;
  },
  async publish(key, owner, row, bytes, now, invalidateFamily = false) {
    return prisma.$transaction(async tx => {
      // Serialize publication for this family to avoid concurrent invalidation deadlocks.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(family_key)::bigint)::text
        FROM mds.kline_response_cache WHERE key = ${key}`;
      const count = await tx.$executeRaw`UPDATE mds.kline_response_cache
      SET payload = ${JSON.stringify(row.payload)}::jsonb, payload_bytes = ${bytes},
        checked_at = ${new Date(row.checkedAt)}, fresh_until = ${new Date(row.freshUntil)},
        expires_at = ${new Date(row.expiresAt)}, retry_after = 'epoch',
        lease_until = 'epoch', lease_owner = NULL, failures = 0, error = NULL,
        last_access_at = ${new Date(now)}
      WHERE key = ${key} AND lease_owner = ${owner} AND lease_until > ${new Date(now)}`;
      if (count === 1 && invalidateFamily) {
        await tx.$executeRaw`UPDATE mds.kline_response_cache SET payload = NULL, payload_bytes = 0,
          fresh_until = 'epoch', expires_at = 'epoch', retry_after = 'epoch',
          lease_until = 'epoch', lease_owner = NULL
          WHERE family_key = (SELECT family_key FROM mds.kline_response_cache WHERE key = ${key})
            AND key <> ${key}`;
      }
      return count === 1;
    });
  },
  async fail(key, owner, error, now) {
    // Failed refresh never advances checked_at/fresh_until/hard expiry of good data.
    await prisma.$executeRaw`UPDATE mds.kline_response_cache SET
      failures = LEAST(failures + 1, 10), error = ${error.slice(0, 300)},
      retry_after = ${new Date(now)} + LEAST(300, 30 * power(2, LEAST(failures, 4))) * interval '1 second',
      expires_at = CASE WHEN payload IS NULL THEN ${new Date(now)} + interval '10 minutes' ELSE expires_at END,
      lease_until = 'epoch', lease_owner = NULL
      WHERE key = ${key} AND lease_owner = ${owner} AND lease_until > ${new Date(now)}`;
  },
  async prune(now) {
    // Single maintenance statement; process-wide timer + cross-process nonblocking advisory lock.
    // Retain at most 10k recent entries / 256 MiB serialized payload, excluding active loaders.
    await prisma.$executeRaw`
      WITH maintenance AS MATERIALIZED (SELECT pg_try_advisory_xact_lock(17498322) AS acquired),
      ranked AS MATERIALIZED (
        SELECT key, expires_at, lease_until,
          row_number() OVER (ORDER BY last_access_at DESC, key) AS n,
          sum(payload_bytes) OVER (ORDER BY last_access_at DESC, key) AS bytes
        FROM mds.kline_response_cache WHERE (SELECT acquired FROM maintenance)
      )
      DELETE FROM mds.kline_response_cache c USING ranked r
      WHERE c.key = r.key AND c.lease_until <= ${new Date(now)}
        AND (r.expires_at <= ${new Date(now)} OR r.n > 10000 OR r.bytes > 268435456)`;
  },
};

export class KlineCacheStorageError extends Error {
  constructor() { super("共享行情缓存暂不可用"); }
}

/** Separate infrastructure errors from upstream errors; never expose database diagnostics. */
export const postgresKlineCacheStore: KlineCacheStore = Object.fromEntries(
  Object.entries(store).map(([name, method]) => [name, async (...args: unknown[]) => {
    try { return await (method as (...args: unknown[]) => Promise<unknown>)(...args); }
    catch { throw new KlineCacheStorageError(); }
  }]),
) as unknown as KlineCacheStore;
