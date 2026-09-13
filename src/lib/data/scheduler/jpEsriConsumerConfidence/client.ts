import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { JP_ESRI_CONSUMER_CONFIDENCE_FILE_URL } from "./catalog";

let cache: { at: number; buffer: Buffer } | undefined;

export async function fetchJpEsriConsumerConfidenceWorkbook(
  fixturePath?: string,
): Promise<Buffer> {
  if (fixturePath) {
    const { readFile } = await import("node:fs/promises");
    return readFile(fixturePath);
  }
  if (cache && Date.now() - cache.at < 60_000) return cache.buffer;
  const response = await fetch(JP_ESRI_CONSUMER_CONFIDENCE_FILE_URL, {
    headers: {
      "User-Agent": "finance-site-data-scheduler/1.0",
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`ESRI consumer confidence workbook HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 10_000 || buffer.subarray(0, 2).toString() !== "PK") {
    throw new Error("ESRI consumer confidence response is not an XLSX workbook");
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const dir = path.join(process.cwd(), ".data", "jp-esri-consumer-confidence");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${sha256}.xlsx`), buffer, { flag: "wx" }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    },
  );
  await writeFile(
    path.join(dir, "latest.json"),
    JSON.stringify(
      {
        url: JP_ESRI_CONSUMER_CONFIDENCE_FILE_URL,
        fetchedAt: new Date().toISOString(),
        sha256,
        parserVersion: 1,
      },
      null,
      2,
    ),
  );
  cache = { at: Date.now(), buffer };
  return buffer;
}

export function clearJpEsriConsumerConfidenceCache() {
  cache = undefined;
}
