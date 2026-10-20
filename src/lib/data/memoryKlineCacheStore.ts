import { klineCacheRetryMs } from "./klineCachePolicy";
import type { KlineCacheRow, KlineCacheStore } from "./klineResponseCache";

type Entry = KlineCacheRow & { owner: string | null; bytes: number; accessedAt: number; family: string };

/** Bounded emergency fallback only; normal service always uses shared PostgreSQL. */
export class MemoryKlineCacheStore implements KlineCacheStore {
  private rows = new Map<string, Entry>();
  async read(key: string) { return this.rows.get(key) ?? null; }
  async touch(key: string, now: number) {
    const row = this.rows.get(key);
    if (row) row.accessedAt = now;
  }
  async claim(key: string, owner: string, now: number, leaseUntil: number, family = key) {
    const row = this.rows.get(key);
    if (row && (row.leaseUntil > now || row.retryAfter > now || row.freshUntil > now)) return false;
    this.pruneNow(now);
    this.rows.set(key, { payload: null, checkedAt: 0, freshUntil: 0,
      expiresAt: leaseUntil, retryAfter: 0, failures: 0, error: null, bytes: 0,
      ...row, leaseUntil, owner, accessedAt: now, family });
    return true;
  }
  async publish(key: string, owner: string, row: KlineCacheRow, bytes: number, now: number, invalidateFamily = false) {
    const old = this.rows.get(key);
    if (old?.owner !== owner || old.leaseUntil <= now) return false;
    this.rows.set(key, { ...row, bytes, owner: null, accessedAt: now, family: old.family });
    if (invalidateFamily) {
      for (const [otherKey, other] of this.rows) {
        if (otherKey !== key && other.family === old.family) this.rows.delete(otherKey);
      }
    }
    await this.prune(now);
    return true;
  }
  async fail(key: string, owner: string, error: string, now: number) {
    const row = this.rows.get(key);
    if (row?.owner !== owner || row.leaseUntil <= now) return;
    row.failures++;
    row.retryAfter = now + klineCacheRetryMs(row.failures);
    row.error = error;
    if (!row.payload) row.expiresAt = now + 600_000;
    row.leaseUntil = 0;
    row.owner = null;
  }
  async prune(now: number) {
    this.pruneNow(now);
  }
  private pruneNow(now: number) {
    let bytes = 0;
    let count = 0;
    for (const [key, row] of [...this.rows].sort((a, b) => b[1].accessedAt - a[1].accessedAt)) {
      bytes += row.bytes;
      count++;
      if (row.leaseUntil <= now && (row.expiresAt <= now || count > 100 || bytes > 16 * 1024 * 1024)) {
        this.rows.delete(key);
      }
    }
  }
}
