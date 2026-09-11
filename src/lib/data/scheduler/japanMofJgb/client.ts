import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { JGB_CURRENT, JGB_HISTORY, JGB_TENORS } from "./catalog";
import { parseJgbCsv } from "./parser";
import type { ObservationPoint } from "../types";

let cached: { at: number; value: Promise<Map<number, ObservationPoint[]>> } | undefined;
async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "finance-site/1.0 (public macro statistics)" }, cache: "no-store" });
  if (!response.ok) throw new Error(`MOF JGB HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = new TextDecoder("shift_jis").decode(bytes);
  const parsed = parseJgbCsv(text);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const folder = path.join(process.cwd(), ".data", "japan-mof-jgb");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, `${hash}.csv`), bytes);
  await writeFile(path.join(folder, `${hash}.json`), JSON.stringify({ url, sha256: hash, fetchedAt: new Date().toISOString(), parserVersion: 1 }));
  return parsed;
}

/** One sequential pair per worker batch; all maturities share it. Full history captures revisions. */
export function fetchJgbCurve(): Promise<Map<number, ObservationPoint[]>> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const value = (async () => {
    const history = await download(JGB_HISTORY);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const current = await download(JGB_CURRENT);
    for (const tenor of JGB_TENORS) {
      const merged = new Map(history.get(tenor)!.map((point) => [point.obsDate.getTime(), point]));
      for (const point of current.get(tenor)!) merged.set(point.obsDate.getTime(), point);
      history.set(tenor, [...merged.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()));
    }
    return history;
  })();
  cached = { at: Date.now(), value };
  value.catch(() => { if (cached?.value === value) cached = undefined; });
  return value;
}
