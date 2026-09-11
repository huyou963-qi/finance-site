import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type EStatMethod = "getStatsList" | "getMetaInfo" | "getStatsData";
export type JsonRecord = Record<string, unknown>;
export const record = (v: unknown): JsonRecord => v && typeof v === "object" && !Array.isArray(v) ? v as JsonRecord : {};
export const list = (v: unknown): JsonRecord[] => (Array.isArray(v) ? v : v == null ? [] : [v]).map(record);
const roots = { getStatsList: "GET_STATS_LIST", getMetaInfo: "GET_META_INFO", getStatsData: "GET_STATS_DATA" };
let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;
const cache = new Map<string, { at: number; value: JsonRecord }>();
const pending = new Map<string, Promise<JsonRecord>>();

/** Remove reflected credentials BEFORE archiving or returning provider data. */
export function redactEStatResponse(value: unknown, secret: string): unknown {
  if (typeof value === "string") return secret ? value.split(secret).join("[REDACTED]") : value;
  if (Array.isArray(value)) return value.map((v) => redactEStatResponse(v, secret));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !/app_?id/i.test(k)).map(([k, v]) => [k, redactEStatResponse(v, secret)]));
  return value;
}

/** Official API 3.0; serialized 1 request/sec, 30s timeout, 60s response cache.
 * Raw response shape is preserved except credentials. Snapshots are ingestion-time evidence, not historical PIT.
 */
export async function requestEStat(method: EStatMethod, params: Record<string, string | number> = {}): Promise<JsonRecord> {
  if (!(method in roots)) throw new Error("e-Stat unsupported method");
  if (Object.keys(params).some((k) => /app_?id/i.test(k))) throw new Error("e-Stat credentials must come from environment");
  const secret = process.env.ESTAT_APP_ID?.trim();
  if (!secret) throw new Error("未配置 ESTAT_APP_ID");
  const safeParams = { lang: "J", ...params };
  const key = JSON.stringify([method, Object.entries(safeParams).sort()]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  if (pending.has(key)) return pending.get(key)!;
  const task = queue.catch(() => undefined).then(async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1000 - (Date.now() - lastRequest))));
    lastRequest = Date.now();
    let json: JsonRecord;
    try {
      const query = new URLSearchParams(Object.entries(safeParams).map(([k,v]) => [k,String(v)]));
      query.set("appId", secret);
      const response = await fetch(`https://api.e-stat.go.jp/rest/3.0/app/json/${method}?${query}`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error("HTTP");
      const text = await response.text();
      if (text.length > 20_000_000) throw new Error("oversized");
      json = record(redactEStatResponse(JSON.parse(text), secret));
    } catch { throw new Error(`e-Stat ${method} request failed (HTTP, timeout or invalid JSON)`); }
    const status = record(record(json[roots[method]]).RESULT).STATUS;
    if (status == null || ![0,1].includes(Number(status))) throw new Error(`e-Stat ${method} API status rejected`);
    const payload = JSON.stringify(json);
    const sha256 = createHash("sha256").update(payload).digest("hex");
    const archive = path.resolve(process.env.ESTAT_CACHE_DIR || ".data/e-stat/snapshots");
    await fs.mkdir(archive, { recursive: true });
    await fs.writeFile(path.join(archive, `${sha256}.json`), payload, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => { if (e.code !== "EEXIST") throw new Error("e-Stat snapshot write failed"); });
    await fs.writeFile(path.join(archive, `${Date.now()}-${sha256.slice(0,12)}.manifest.json`), JSON.stringify({ fetchedAt: new Date().toISOString(), method, params: safeParams, sha256 }));
    cache.set(key, { at: Date.now(), value: json });
    for (const [k,v] of cache) if (Date.now() - v.at > 60_000) cache.delete(k);
    return json;
  });
  queue = task;
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
