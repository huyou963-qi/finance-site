import fs from "node:fs";
import * as XLSX from "xlsx";
import {
  eiaWpsrWorkbookUrl,
  findEiaWpsrSeriesBySourceKey,
} from "./catalog";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; workbook: XLSX.WorkBook }>();

function readWorkbook(buffer: Buffer, sourceSeriesKey: string): XLSX.WorkBook {
  const oleMagic = buffer.subarray(0, 8).toString("hex").toLowerCase();
  if (oleMagic !== "d0cf11e0a1b11ae1") {
    throw new Error(
      `EIA WPSR ${sourceSeriesKey}：下载内容不是 OLE/BIFF XLS（magic=${oleMagic || "empty"}）`,
    );
  }
  return XLSX.read(buffer, { type: "buffer", raw: true });
}

export async function fetchEiaWpsrWorkbook(
  sourceSeriesKey: string,
  options?: { url?: string; fixturePath?: string },
): Promise<XLSX.WorkBook> {
  if (!findEiaWpsrSeriesBySourceKey(sourceSeriesKey)) {
    throw new Error(`EIA WPSR：未登记 sourceSeriesKey=${sourceSeriesKey}`);
  }
  if (options?.fixturePath) {
    return readWorkbook(fs.readFileSync(options.fixturePath), sourceSeriesKey);
  }

  const url = options?.url ?? eiaWpsrWorkbookUrl(sourceSeriesKey);
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.workbook;

  const response = await fetch(url, {
    headers: {
      "User-Agent": process.env.EIA_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "application/vnd.ms-excel,application/octet-stream;q=0.9,*/*;q=0.1",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`EIA WPSR ${sourceSeriesKey} 抓取 HTTP ${response.status}: ${url}`);
  }
  const workbook = readWorkbook(Buffer.from(await response.arrayBuffer()), sourceSeriesKey);
  cache.set(url, { at: Date.now(), workbook });
  return workbook;
}

export function clearEiaWpsrCache(): void {
  cache.clear();
}
