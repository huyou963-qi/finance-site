import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  JP_MOF_EXTERNAL_DEBT_XLS,
  JP_MOF_EXTERNAL_POSITION_PAGE,
  JP_MOF_IIP_XLS,
} from "./catalog";

export type JpMofExternalPositionFiles = { iip: Buffer; debt: Buffer };
let cached: { at: number; files: JpMofExternalPositionFiles } | undefined;

async function download(url: string, label: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "finance-site-data-scheduler/1.0 (public macro statistics)",
      Accept: "application/vnd.ms-excel,application/octet-stream",
    },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`MOF ${label} XLS HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 30_000 || buffer.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") {
    throw new Error(`MOF ${label} response is not an XLS workbook`);
  }
  return { buffer, response };
}

export async function fetchJpMofExternalPositionFiles(fixtures?: {
  iipPath?: string;
  debtPath?: string;
}): Promise<JpMofExternalPositionFiles> {
  if (fixtures?.iipPath || fixtures?.debtPath) {
    if (!fixtures.iipPath || !fixtures.debtPath) throw new Error("Both MOF external-position fixtures are required");
    return { iip: await readFile(fixtures.iipPath), debt: await readFile(fixtures.debtPath) };
  }
  if (cached && Date.now() - cached.at < 60_000) return cached.files;
  const [iipDownload, debtDownload] = await Promise.all([
    download(JP_MOF_IIP_XLS, "IIP"),
    download(JP_MOF_EXTERNAL_DEBT_XLS, "external debt"),
  ]);
  const files = { iip: iipDownload.buffer, debt: debtDownload.buffer };
  const directory = path.join(process.cwd(), ".data", "jp-mof-external-position", "snapshots");
  await mkdir(directory, { recursive: true });
  for (const [label, buffer] of Object.entries(files)) {
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    await writeFile(path.join(directory, `${label}-${sha256}.xls`), buffer, { flag: "wx" }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      },
    );
  }
  await writeFile(
    path.join(directory, "latest.json"),
    JSON.stringify(
      {
        officialUrl: JP_MOF_EXTERNAL_POSITION_PAGE,
        fetchedAt: new Date().toISOString(),
        files: Object.fromEntries(
          Object.entries(files).map(([label, buffer]) => [
            label,
            { sha256: createHash("sha256").update(buffer).digest("hex"), bytes: buffer.length },
          ]),
        ),
        parserVersion: 1,
      },
      null,
      2,
    ),
  );
  cached = { at: Date.now(), files };
  return files;
}
