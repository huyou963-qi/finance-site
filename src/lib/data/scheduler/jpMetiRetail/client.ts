import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JP_METI_RETAIL_ESTAT_LIST, JP_METI_RETAIL_PAGE } from "./catalog";
import { parseJpMetiRetailFileList } from "./discovery";

let cached: { at: number; buffer: Buffer } | undefined;
let pending: Promise<Buffer> | undefined;
let lastRequestAt = 0;

async function throttledFetch(url: string, accept: string) {
  const delay = Math.max(0, 2_000 - (Date.now() - lastRequestAt));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRequestAt = Date.now();
  const response = await fetch(url, {
    headers: { "User-Agent": "finance-site-data-scheduler/1.0", Accept: accept },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`METI commerce e-Stat source HTTP ${response.status}`);
  return response;
}

/** METI's static file endpoint rejects generic clients intermittently, so use a
 * normal browser UA and the official listing page as referer. One workbook
 * supplies all series; retain its hash-addressed bytes for revision evidence. */
export async function fetchJpMetiRetailWorkbook(fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  if (cached && Date.now() - cached.at < 60_000) return cached.buffer;
  if (pending) return pending;
  pending = (async () => {
    const year = new Date().getUTCFullYear();
    const listResponse = await throttledFetch(`${JP_METI_RETAIL_ESTAT_LIST}&year=${year}0&month=0`, "text/html");
    const html = await listResponse.text();
    if (!html.includes("商業動態統計調査") || html.length < 10_000) {
      throw new Error("METI commerce e-Stat catalogue response changed");
    }
    const discovered = parseJpMetiRetailFileList(html);
    const response = await throttledFetch(
      discovered.downloadUrl,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.subarray(0, 2).toString() !== "PK") throw new Error("METI commerce response is not XLSX");
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const directory = path.join(process.cwd(), ".data", "jp-meti-retail", "snapshots");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${sha256}.xlsx`), buffer, { flag: "wx" }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      },
    );
    await writeFile(
      path.join(directory, "latest.json"),
      JSON.stringify(
        {
          catalogueUrl: JP_METI_RETAIL_ESTAT_LIST,
          officialUrl: JP_METI_RETAIL_PAGE,
          url: discovered.downloadUrl,
          statInfId: discovered.statInfId,
          surveyYear: discovered.surveyYear,
          releaseDate: discovered.releaseDate,
          fetchedAt: new Date().toISOString(),
          sha256,
          lastModified: response.headers.get("last-modified"),
          etag: response.headers.get("etag"),
          parserVersion: 1,
        },
        null,
        2,
      ),
    );
    cached = { at: Date.now(), buffer };
    return buffer;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
