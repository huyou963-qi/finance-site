type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const alertCooldown = new Map<string, number>();

let lastPruneAt = 0;
const PRUNE_EVERY_MS = 60_000;

/** 清理已过期的限流 / 告警冷却键，避免 Map 无限增长。 */
export function pruneRateLimitMaps(now = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  for (const [key, until] of alertCooldown) {
    if (until <= now) alertCooldown.delete(key);
  }
  lastPruneAt = now;
}

function maybePrune(now: number): void {
  if (now - lastPruneAt >= PRUNE_EVERY_MS) pruneRateLimitMaps(now);
}

/**
 * 同 key 在 windowMs 内最多累计 max 次（或 cost 之和）；超出返回 false。
 * cost 用于按写入行数等计量。
 */
export function allowRateLimit(
  key: string,
  max: number,
  windowMs: number,
  cost = 1,
): boolean {
  const now = Date.now();
  maybePrune(now);
  const add = Math.max(1, Math.floor(cost));
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (add > max) return false;
    buckets.set(key, { count: add, resetAt: now + windowMs });
    return true;
  }
  if (existing.count + add > max) return false;
  existing.count += add;
  return true;
}

/** 同指纹在 cooldownMs 内是否应跳过告警（仍可入库）。 */
export function shouldSkipAlert(fingerprint: string, cooldownMs: number): boolean {
  const now = Date.now();
  maybePrune(now);
  const until = alertCooldown.get(fingerprint);
  if (until && until > now) return true;
  alertCooldown.set(fingerprint, now + cooldownMs);
  return false;
}

/** 测试用：清空限流状态 */
export function resetRateLimitMapsForTests(): void {
  buckets.clear();
  alertCooldown.clear();
  lastPruneAt = 0;
}
