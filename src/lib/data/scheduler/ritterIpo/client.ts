import * as XLSX from "xlsx";
import fs from "node:fs";
import { RITTER_IPO_XLS_URL } from "./catalog";

let cache: { at: number; wb: XLSX.WorkBook } | null = null;
const CACHE_TTL_MS = 60_000;

/** 抓取（或读 fixture）Ritter IPOALL 工作簿；四条分项同轮 worker 60s 内复用同一份下载。 */
export async function fetchRitterIpoWorkbook(opts?: {
  fixturePath?: string;
  url?: string;
}): Promise<XLSX.WorkBook> {
  if (opts?.fixturePath) {
    return XLSX.read(fs.readFileSync(opts.fixturePath), { type: "buffer" });
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.wb;

  const url = opts?.url ?? RITTER_IPO_XLS_URL;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.RITTER_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Ritter IPOALL 抓取 HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  cache = { at: Date.now(), wb };
  return wb;
}

export function clearRitterIpoCache(): void {
  cache = null;
}
