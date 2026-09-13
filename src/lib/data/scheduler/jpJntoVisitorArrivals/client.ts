import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JP_JNTO_VISITOR_ARRIVALS_PAGE_URL } from "./catalog";
import { parseJpJntoVisitorArrivalsPage } from "./parser";

let cached: { at: number; buffer: Buffer } | undefined;
let pending: Promise<Buffer> | undefined;
let lastRequestAt = 0;

async function throttledFetch(url: string, accept: string): Promise<Response> {
  const delay = Math.max(0, 5_000 - (Date.now() - lastRequestAt));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRequestAt = Date.now();
  return fetch(url, {
    headers: {
      "User-Agent": "finance-site-data-scheduler/1.0 (official-statistics; low-frequency)",
      Accept: accept,
    },
    signal: AbortSignal.timeout(30_000),
  });
}

/** Discover and download the one rolling official workbook for all six series. */
export async function fetchJpJntoVisitorArrivalsWorkbook(fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  if (cached && Date.now() - cached.at < 60_000) return cached.buffer;
  if (pending) return pending;
  pending = (async () => {
    const pageResponse = await throttledFetch(JP_JNTO_VISITOR_ARRIVALS_PAGE_URL, "text/html");
    if (!pageResponse.ok) throw new Error(`JNTO visitor arrivals index HTTP ${pageResponse.status}`);
    const pageHtml = await pageResponse.text();
    const workbookUrl = parseJpJntoVisitorArrivalsPage(pageHtml);

    const response = await throttledFetch(
      workbookUrl,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    if (!response.ok) throw new Error(`JNTO visitor arrivals workbook HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.subarray(0, 2).toString() !== "PK" || buffer.length < 300_000 || buffer.length > 10_000_000) {
      throw new Error("JNTO visitor arrivals workbook signature/size changed");
    }

    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const directory = path.join(process.cwd(), ".data", "jp-jnto-visitor-arrivals", "snapshots");
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
          pageUrl: JP_JNTO_VISITOR_ARRIVALS_PAGE_URL,
          workbookUrl,
          fetchedAt: new Date().toISOString(),
          sha256,
          contentLength: buffer.length,
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
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

