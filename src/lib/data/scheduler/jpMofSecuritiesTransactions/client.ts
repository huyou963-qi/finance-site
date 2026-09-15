import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JP_MOF_SECURITIES_CSV, JP_MOF_SECURITIES_PAGE } from "./catalog";

let cached: { at: number; buffer: Buffer } | undefined;

export async function fetchJpMofSecuritiesCsv(fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  if (cached && Date.now() - cached.at < 60_000) return cached.buffer;
  const response = await fetch(JP_MOF_SECURITIES_CSV, {
    headers: {
      "User-Agent": "finance-site-data-scheduler/1.0 (public macro statistics)",
      Accept: "text/csv",
    },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`MOF securities CSV HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 50_000) throw new Error("MOF securities CSV unexpectedly small");
  const text = decodeJpMofSecuritiesCsv(buffer);
  if (!text.includes("International Transactions in Securities") || !text.includes("Portfolio Investment Assets")) {
    throw new Error("MOF securities response is not the official monthly CSV");
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const directory = path.join(process.cwd(), ".data", "jp-mof-securities-transactions", "snapshots");
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
        officialUrl: JP_MOF_SECURITIES_PAGE,
        fetchUrl: JP_MOF_SECURITIES_CSV,
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
}

export function decodeJpMofSecuritiesCsv(buffer: Buffer) {
  return new TextDecoder("shift_jis").decode(buffer);
}
