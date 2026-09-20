import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { JP_ESRI_CI_FILE_URL, JP_JOB_RATIO_FILE_URL, JP_LFS_SA_FILE_URL } from "./catalog";

const urls = { ci: JP_ESRI_CI_FILE_URL, unemployment: JP_LFS_SA_FILE_URL, jobRatio: JP_JOB_RATIO_FILE_URL } as const;
export type JpCycleLaborSource = keyof typeof urls;
let cache = new Map<JpCycleLaborSource, { at: number; value: Buffer }>();

export async function fetchJpCycleLaborWorkbook(source: JpCycleLaborSource, fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  const hit = cache.get(source);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const response = await fetch(urls[source], { headers: { "User-Agent": "finance-site-data-scheduler/1.0", Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Japan cycle/labor workbook HTTP ${response.status}`);
  const value = Buffer.from(await response.arrayBuffer());
  if (value.length < 10_000 || value.subarray(0, 2).toString() !== "PK") throw new Error("Japan cycle/labor response is not XLSX");
  const sha256 = createHash("sha256").update(value).digest("hex");
  const dir = path.join(process.cwd(), ".data", "jp-cycle-labor");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${source}-${sha256}.xlsx`), value, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => { if (e.code !== "EEXIST") throw e; });
  await writeFile(path.join(dir, `${source}-latest.json`), JSON.stringify({ url: urls[source], fetchedAt: new Date().toISOString(), sha256, parserVersion: 1 }, null, 2));
  cache.set(source, { at: Date.now(), value });
  return value;
}
