import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JP_MOF_RESERVES_CSV, JP_MOF_RESERVES_PAGE } from "./catalog";

let cached: { at: number; buffer: Buffer } | undefined;
let pending: Promise<Buffer> | undefined;

export async function fetchJpMofReservesCsv(fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  if (cached && Date.now() - cached.at < 60_000) return cached.buffer;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch(JP_MOF_RESERVES_CSV, {
      headers: {
        "User-Agent": "finance-site-data-scheduler/1.0 (public macro statistics)",
        Accept: "text/csv",
      },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`MOF reserves CSV HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 50_000) throw new Error("MOF reserves CSV unexpectedly small");
    const decoded = new TextDecoder("shift_jis").decode(buffer);
    if (!decoded.includes("International Reserves/Foreign Currency Liquidity")) {
      throw new Error("MOF reserves response is not the official CSV");
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const directory = path.join(process.cwd(), ".data", "jp-mof-reserves", "snapshots");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${sha256}.csv`), buffer, { flag: "wx" }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      },
    );
    await writeFile(
      path.join(directory, "latest.json"),
      JSON.stringify(
        {
          officialUrl: JP_MOF_RESERVES_PAGE,
          fetchUrl: JP_MOF_RESERVES_CSV,
          fetchedAt: new Date().toISOString(),
          sha256,
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

export function decodeJpMofReservesCsv(buffer: Buffer) {
  return new TextDecoder("shift_jis").decode(buffer);
}
