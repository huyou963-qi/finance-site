import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { JP_METI_IIP_URL } from "./catalog";

let cached: { at: number; buffer: Buffer } | undefined;
let pending: Promise<Buffer> | undefined;
let lastRequestAt = 0;
/** One shared request for all four components. Hash-addressed raw snapshots
 * preserve the official workbook and preliminary markers without inventing
 * historical release dates. Transport errors propagate to worker backoff. */
export async function fetchJpMetiIipWorkbook(fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  if (cached && Date.now() - cached.at < 60_000) return cached.buffer;
  if (pending) return pending;
  pending = (async () => {
    const delay = Math.max(0, 5000 - (Date.now() - lastRequestAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequestAt = Date.now();
    const response = await fetch(JP_METI_IIP_URL, { headers: { "User-Agent": "finance-site-data-scheduler/1.0", Accept: "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`METI IIP official file HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!(buffer.subarray(0, 2).toString() === "PK" || buffer.subarray(0, 4).toString("hex") === "d0cf11e0")) throw new Error("METI IIP response is not an Excel workbook");
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const dir = path.join(process.cwd(), ".data", "jp-meti-iip", "snapshots");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${sha256}.xlsx`), buffer, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    await writeFile(path.join(dir, "latest.json"), JSON.stringify({ url: JP_METI_IIP_URL, fetchedAt: new Date().toISOString(), sha256, parserVersion: 1 }, null, 2));
    cached = { at: Date.now(), buffer };
    return buffer;
  })();
  try { return await pending; } finally { pending = undefined; }
}
