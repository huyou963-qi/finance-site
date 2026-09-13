import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JP_ESRI_MACHINERY_ORDERS_PAGE_URL } from "./catalog";
import { discoverJpEsriMachineryOrdersWorkbookUrl } from "./parser";

let cached: { at: number; buffer: Buffer } | undefined;
let pending: Promise<Buffer> | undefined;
let lastRequestAt = 0;

async function throttledFetch(url: string, accept: string): Promise<Response> {
  const delay = Math.max(0, 2_000 - (Date.now() - lastRequestAt));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRequestAt = Date.now();
  const response = await fetch(url, {
    headers: {
      "User-Agent": "finance-site-data-scheduler/1.0",
      Accept: accept,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`ESRI machinery orders source HTTP ${response.status}`);
  return response;
}

export async function fetchJpEsriMachineryOrdersWorkbook(
  fixturePath?: string,
): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  if (cached && Date.now() - cached.at < 60_000) return cached.buffer;
  if (pending) return pending;
  pending = (async () => {
    const indexResponse = await throttledFetch(JP_ESRI_MACHINERY_ORDERS_PAGE_URL, "text/html");
    const indexHtml = await indexResponse.text();
    const workbookUrl = discoverJpEsriMachineryOrdersWorkbookUrl(indexHtml);
    const workbookResponse = await throttledFetch(
      workbookUrl,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const buffer = Buffer.from(await workbookResponse.arrayBuffer());
    if (buffer.length < 100_000 || buffer.subarray(0, 2).toString() !== "PK") {
      throw new Error("ESRI machinery orders response is not the expected XLSX workbook");
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const directory = path.join(process.cwd(), ".data", "jp-esri-machinery-orders", "snapshots");
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
          indexUrl: JP_ESRI_MACHINERY_ORDERS_PAGE_URL,
          workbookUrl,
          fetchedAt: new Date().toISOString(),
          sha256,
          lastModified: workbookResponse.headers.get("last-modified"),
          etag: workbookResponse.headers.get("etag"),
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

export function clearJpEsriMachineryOrdersCache() {
  cached = undefined;
}
