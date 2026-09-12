import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  JP_MHLW_MONTHLY_LABOUR_LIST_URL,
  jpMhlwMonthlyLabourSeriesByCode,
} from "./catalog";
import { parseJpMhlwMonthlyLabourFileList } from "./discovery";

type CachedWorkbook = { at: number; buffer: Buffer };
const workbookCache = new Map<string, CachedWorkbook>();
let discoveryCache: { at: number; files: ReturnType<typeof parseJpMhlwMonthlyLabourFileList> } | undefined;
let lastRequestAt = 0;

async function throttledFetch(url: string, accept: string) {
  const delay = Math.max(0, 2_000 - (Date.now() - lastRequestAt));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRequestAt = Date.now();
  const response = await fetch(url, {
    headers: { "User-Agent": "finance-site-data-scheduler/1.0", Accept: accept },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`MHLW monthly labour official source HTTP ${response.status}`);
  return response;
}

async function discoverFiles() {
  if (discoveryCache && Date.now() - discoveryCache.at < 10 * 60_000) return discoveryCache.files;
  const response = await throttledFetch(JP_MHLW_MONTHLY_LABOUR_LIST_URL, "text/html");
  const html = await response.text();
  if (!html.includes("毎月勤労統計調査") || html.length < 10_000) {
    throw new Error("MHLW monthly labour e-Stat catalogue response changed");
  }
  const files = parseJpMhlwMonthlyLabourFileList(html);
  discoveryCache = { at: Date.now(), files };
  return files;
}

/** Download, validate and hash-archive the official long-series workbook. */
export async function fetchJpMhlwMonthlyLabourWorkbook(
  instrumentCode: string,
  fixturePath?: string,
): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  const series = jpMhlwMonthlyLabourSeriesByCode(instrumentCode);
  if (!series) throw new Error(`unknown MHLW monthly labour series: ${instrumentCode}`);
  const cached = workbookCache.get(instrumentCode);
  if (cached && Date.now() - cached.at < 60_000) return cached.buffer;
  const files = await discoverFiles();
  const discovered = files.find((file) => file.instrumentCode === instrumentCode);
  if (!discovered) throw new Error(`MHLW monthly labour file not discovered: ${instrumentCode}`);
  const response = await throttledFetch(
    discovered.downloadUrl,
    "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const buffer = Buffer.from(await response.arrayBuffer());
  const isXls = buffer.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1";
  const isXlsx = buffer.subarray(0, 2).toString() === "PK";
  if ((!isXls && !isXlsx) || buffer.length < 5_000) {
    throw new Error("MHLW monthly labour response is not an Excel workbook");
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const dir = path.join(process.cwd(), ".data", "jp-mhlw-monthly-labour", discovered.statInfId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${sha256}.${isXls ? "xls" : "xlsx"}`), buffer, { flag: "wx" }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    },
  );
  await writeFile(
    path.join(dir, "latest.json"),
    JSON.stringify(
      {
        instrumentCode,
        statInfId: discovered.statInfId,
        tableNo: discovered.tableNo,
        surveyMonth: discovered.surveyMonth,
        releaseCount: discovered.releaseCount,
        url: discovered.downloadUrl,
        fetchedAt: new Date().toISOString(),
        sha256,
        parserVersion: 1,
      },
      null,
      2,
    ),
  );
  workbookCache.set(instrumentCode, { at: Date.now(), buffer });
  return buffer;
}

export function clearJpMhlwMonthlyLabourCache() {
  workbookCache.clear();
  discoveryCache = undefined;
  lastRequestAt = 0;
}
