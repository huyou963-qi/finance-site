import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { JP_ESRI_CI_URL, JP_JOB_RATIO_FILE_URL, JP_LFS_SA_FILE_URL } from "./catalog";

const urls = { unemployment: JP_LFS_SA_FILE_URL, jobRatio: JP_JOB_RATIO_FILE_URL } as const;
export type JpCycleLaborSource = keyof typeof urls | "ci";
let cache = new Map<JpCycleLaborSource, { at: number; value: Buffer }>();

/** The ESRI release page names the rolling CI workbook YYYYci.xlsx. */
export function discoverEsriCiWorkbookUrl(page: string): string {
  const matches = [...page.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1], JP_ESRI_CI_URL).toString())
    .filter((url) => /\/\d{4}ci\.xlsx(?:$|[?#])/i.test(url));
  if (matches.length !== 1) throw new Error("ESRI CI historical workbook link missing or ambiguous");
  return matches[0]!;
}

async function download(url: string, accept: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": "finance-site-data-scheduler/1.0", Accept: accept },
    signal: AbortSignal.timeout(30_000),
  });
}

export async function fetchJpCycleLaborWorkbook(source: JpCycleLaborSource, fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  const hit = cache.get(source);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  let url: string;
  let response: Response;
  if (source === "ci") {
    const index = await download(JP_ESRI_CI_URL, "text/html,application/xhtml+xml");
    if (!index.ok) throw new Error(`Japan cycle/labor ESRI index HTTP ${index.status}`);
    url = discoverEsriCiWorkbookUrl(await index.text());
    response = await download(url, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream");
  } else {
    url = urls[source];
    response = await download(url, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream");
  }
  if (!response.ok) throw new Error(`Japan cycle/labor workbook HTTP ${response.status}`);
  const value = Buffer.from(await response.arrayBuffer());
  if (value.length < 10_000 || value.subarray(0, 2).toString() !== "PK") throw new Error("Japan cycle/labor response is not XLSX");
  const sha256 = createHash("sha256").update(value).digest("hex");
  const dir = path.join(process.cwd(), ".data", "jp-cycle-labor");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${source}-${sha256}.xlsx`), value, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => { if (e.code !== "EEXIST") throw e; });
  await writeFile(path.join(dir, `${source}-latest.json`), JSON.stringify({ url, fetchedAt: new Date().toISOString(), sha256, parserVersion: 2 }, null, 2));
  cache.set(source, { at: Date.now(), value });
  return value;
}
