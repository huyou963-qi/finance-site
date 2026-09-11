import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BOJ_API_BASE, type BojSeries } from "./catalog";

let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;
const cache = new Map<string, { at: number; result: unknown }>();

/** Full official history on each refresh captures revisions, including pre-window revisions.
 * Single-series requests avoid BOJ's 250-series/60,000-point pagination threshold.
 */
export function fetchBojSeries(row: BojSeries): Promise<unknown> {
  const key = `${row.db}:${row.seriesCode}`;
  const task = queue.then(async () => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < 60_000) return cached.result;
    const wait = 2000 - (Date.now() - lastRequest);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
    const url = new URL(`${BOJ_API_BASE}/getDataCode`);
    url.search = new URLSearchParams({ format: "json", lang: "en", db: row.db, code: row.seriesCode }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`BOJ HTTP ${response.status}`);
    const text = await response.text();
    const result: unknown = JSON.parse(text);
    const hash = createHash("sha256").update(text).digest("hex");
    const directory = join(process.cwd(), ".data", "boj", "snapshots", row.db);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${row.key}-${hash}.json`), text, "utf8");
    await writeFile(join(directory, `${row.key}-${hash}.meta.json`), JSON.stringify({ url: url.toString(), fetchedAt: new Date().toISOString(), sha256: hash, parserVersion: 1 }), "utf8");
    cache.set(key, { at: Date.now(), result });
    return result;
  });
  queue = task.catch(() => undefined);
  return task;
}
