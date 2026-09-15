import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JP_CUSTOMS_TRADE_CSV, JP_CUSTOMS_TRADE_PAGE } from "./catalog";

let cached: { at: number; buffer: Buffer } | undefined;

export async function fetchJpCustomsTradeCsv(fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  if (cached && Date.now() - cached.at < 60_000) return cached.buffer;
  const response = await fetch(JP_CUSTOMS_TRADE_CSV, {
    headers: {
      "User-Agent": "finance-site-data-scheduler/1.0 (public macro statistics)",
      Accept: "text/csv",
    },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Japan Customs trade CSV HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 10_000) throw new Error("Japan Customs trade CSV unexpectedly small");
  const text = decodeJpCustomsTradeCsv(buffer);
  if (!text.includes("WORLD  Monthly Data") || !text.includes("Years/Months,Exp-Total,Imp-Total")) {
    throw new Error("Japan Customs response is not the official world monthly CSV");
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const directory = path.join(process.cwd(), ".data", "jp-customs-trade", "snapshots");
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
        officialUrl: JP_CUSTOMS_TRADE_PAGE,
        fetchUrl: JP_CUSTOMS_TRADE_CSV,
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

export function decodeJpCustomsTradeCsv(buffer: Buffer) {
  return new TextDecoder("shift_jis").decode(buffer);
}
