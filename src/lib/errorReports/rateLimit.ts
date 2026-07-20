type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** 同 key 在 windowMs 内最多 max 次；超出返回 false。 */
export function allowRateLimit(
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count += 1;
  return true;
}

const alertCooldown = new Map<string, number>();

/** 同指纹在 cooldownMs 内是否应跳过告警（仍可入库）。 */
export function shouldSkipAlert(fingerprint: string, cooldownMs: number): boolean {
  const now = Date.now();
  const until = alertCooldown.get(fingerprint);
  if (until && until > now) return true;
  alertCooldown.set(fingerprint, now + cooldownMs);
  return false;
}
