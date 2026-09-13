import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JP_CAO_WATCHERS_PAGE_URL, JP_CAO_WATCHERS_WORKBOOK_URL } from "./catalog";
import { parseJpCaoWatchersIndexPage } from "./parser";

let cached: { at: number; buffer: Buffer } | undefined;
let pending: Promise<Buffer> | undefined;
let lastRequestAt = 0;

async function throttledFetch(url: string, accept: string): Promise<Response> {
  const delay = Math.max(0, 5_000 - (Date.now() - lastRequestAt));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRequestAt = Date.now();
  return fetch(url, {
    headers: { "User-Agent": "finance-site-data-scheduler/1.0", Accept: accept },
    signal: AbortSignal.timeout(30_000),
  });
}

/** One HTML discovery and one official static XLS request per run, shared by all
 * eight components for 60 seconds. The raw workbook is content-addressed so
 * later seasonal revisions can be audited against the exact fetched artifact. */
export async function fetchJpCaoWatchersWorkbook(fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  if (cached && Date.now() - cached.at < 60_000) return cached.buffer;
  if (pending) return pending;
  pending = (async () => {
    const pageResponse = await throttledFetch(JP_CAO_WATCHERS_PAGE_URL, "text/html");
    if (!pageResponse.ok) throw new Error(`Cabinet Office Economy Watchers index HTTP ${pageResponse.status}`);
    const pageHtml = await pageResponse.text();
    const discoveredUrl = parseJpCaoWatchersIndexPage(pageHtml);
    if (discoveredUrl !== JP_CAO_WATCHERS_WORKBOOK_URL) {
      throw new Error(`Cabinet Office Economy Watchers workbook URL changed: ${discoveredUrl}`);
    }
    const response = await throttledFetch(discoveredUrl, "application/vnd.ms-excel");
    if (!response.ok) throw new Error(`Cabinet Office Economy Watchers workbook HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.subarray(0, 4).toString("hex") !== "d0cf11e0") {
      throw new Error("Cabinet Office Economy Watchers response is not an OLE Excel workbook");
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const dir = path.join(process.cwd(), ".data", "jp-cao-economy-watchers", "snapshots");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${sha256}.xls`), buffer, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    await writeFile(path.join(dir, "latest.json"), JSON.stringify({
      pageUrl: JP_CAO_WATCHERS_PAGE_URL,
      workbookUrl: discoveredUrl,
      fetchedAt: new Date().toISOString(),
      sha256,
      contentLength: buffer.length,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      parserVersion: 1,
    }, null, 2));
    cached = { at: Date.now(), buffer };
    return buffer;
  })();
  try { return await pending; } finally { pending = undefined; }
}
