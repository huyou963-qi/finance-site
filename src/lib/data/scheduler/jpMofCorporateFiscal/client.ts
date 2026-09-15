import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { requestEStat, type JsonRecord } from "../eStat/client";
import {
  JP_MOF_CORPORATE_TABLE,
  JP_MOF_DEBT_WORKBOOK_URL,
  JP_MOF_FISCAL_DEBT_SERVICE_URL,
  JP_MOF_FISCAL_RESULTS_URL,
} from "./catalog";

type WorkbookKind = "fiscal_results" | "debt_service" | "debt";
const cache = new Map<string, { at: number; buffer: Buffer }>();
const pending = new Map<string, Promise<Buffer>>();
let lastRequestAt = 0;

async function archiveOfficialFile(kind: WorkbookKind, url: string, buffer: Buffer, response: Response) {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const directory = path.join(process.cwd(), ".data", "jp-mof-corporate-fiscal", "snapshots");
  await mkdir(directory, { recursive: true });
  const extension = kind === "debt" ? "xls" : "xlsx";
  await writeFile(path.join(directory, `${sha256}.${extension}`), buffer, { flag: "wx" }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    },
  );
  await writeFile(
    path.join(directory, `${kind}-latest.json`),
    JSON.stringify({
      url,
      fetchedAt: new Date().toISOString(),
      sha256,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      parserVersion: 1,
    }, null, 2),
  );
}

export async function fetchJpMofWorkbook(kind: WorkbookKind, fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  const hit = cache.get(kind);
  if (hit && Date.now() - hit.at < 60_000) return hit.buffer;
  const inFlight = pending.get(kind);
  if (inFlight) return inFlight;
  const url = kind === "fiscal_results"
    ? JP_MOF_FISCAL_RESULTS_URL
    : kind === "debt_service"
      ? JP_MOF_FISCAL_DEBT_SERVICE_URL
      : JP_MOF_DEBT_WORKBOOK_URL;
  const task = (async () => {
    const delay = Math.max(0, 2_000 - (Date.now() - lastRequestAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequestAt = Date.now();
    const response = await fetch(url, {
      headers: {
        "User-Agent": "finance-site-data-scheduler/1.0",
        Accept: "application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`MOF workbook HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 8_000) throw new Error("MOF workbook unexpectedly small");
    const signature = buffer.subarray(0, 8).toString("hex");
    if (kind === "debt" ? signature !== "d0cf11e0a1b11ae1" : !signature.startsWith("504b")) {
      throw new Error("MOF workbook format changed");
    }
    await archiveOfficialFile(kind, url, buffer, response);
    cache.set(kind, { at: Date.now(), buffer });
    return buffer;
  })();
  pending.set(kind, task);
  try {
    return await task;
  } finally {
    pending.delete(kind);
  }
}

export async function fetchJpMofCorporateResponse(itemCode: string, fixturePath?: string): Promise<JsonRecord> {
  if (fixturePath) return JSON.parse(await readFile(fixturePath, "utf8")) as JsonRecord;
  if (!/^\d{3}$/.test(itemCode)) throw new Error("MOF corporate invalid item code");
  return requestEStat("getStatsData", {
    statsDataId: JP_MOF_CORPORATE_TABLE,
    cdCat01: itemCode,
    cdCat02: "104",
    cdCat03: "26",
    metaGetFlg: "Y",
    limit: 10_000,
  });
}

export function clearJpMofCorporateFiscalCache() {
  cache.clear();
}
