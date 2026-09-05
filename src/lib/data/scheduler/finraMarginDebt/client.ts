import * as XLSX from "xlsx";
import fs from "node:fs";
import { FINRA_MARGIN_STATISTICS_XLS_URL } from "./catalog";

let cache: { at: number; wb: XLSX.WorkBook } | null = null;
const CACHE_TTL_MS = 60_000;

/** 抓取（或读 fixture）FINRA Margin Statistics 工作簿；同轮 worker 60s 内复用。 */
export async function fetchFinraMarginStatisticsWorkbook(opts?: {
  fixturePath?: string;
  url?: string;
}): Promise<XLSX.WorkBook> {
  if (opts?.fixturePath) {
    return XLSX.read(fs.readFileSync(opts.fixturePath), { type: "buffer" });
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.wb;

  const url = opts?.url ?? FINRA_MARGIN_STATISTICS_XLS_URL;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.FINRA_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "application/vnd.ms-excel,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`FINRA Margin Statistics 抓取 HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  cache = { at: Date.now(), wb };
  return wb;
}

export function clearFinraMarginStatisticsCache(): void {
  cache = null;
}
