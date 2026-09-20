import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { JP_MLIT_PROPERTY_PRICE_URL } from "./catalog";

const NATIONAL_SA_SHEET = "全国Japan季節調整";

function parsePeriod(value: unknown): Date | null {
  const match = /^(\d{4})\/(\d{1,2})$/.exec(String(value ?? "").trim());
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

function parseIndex(value: unknown): number | null {
  const text = String(value ?? "").replace(/[()\s,]/g, "");
  if (!text) return null;
  if (!/^(?:\d+|\d+\.\d+)$/.test(text)) throw new Error("MLIT property-price workbook has unknown index notation");
  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0 || number > 1000) throw new Error("MLIT property-price index outside expected range");
  return number;
}

/** Extract only the national, seasonally-adjusted residential composite (column B).
 * The workbook also contains national subtypes and many regional sheets; accepting
 * any of those by a fuzzy match would silently reintroduce excluded detail series.
 */
export function parseJpMlitNationalResidentialPriceIndex(workbookBuffer: Buffer): ObservationPoint[] {
  const workbook = XLSX.read(workbookBuffer, { type: "buffer", raw: false });
  const sheet = workbook.Sheets[NATIONAL_SA_SHEET];
  if (!sheet) throw new Error("MLIT property-price national SA worksheet missing");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  const header = rows.slice(0, 10).map((row) => row.map(String).join(" ")).join("\n");
  if (!/住宅総合/.test(header) || !/Property Price Index/.test(header)) {
    throw new Error("MLIT property-price worksheet schema changed");
  }
  const points: ObservationPoint[] = [];
  for (const row of rows.slice(9)) {
    const date = parsePeriod(row[0]);
    if (!date) continue;
    const value = parseIndex(row[1]);
    if (value !== null) points.push({ obsDate: date, value });
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (points.length < 100) throw new Error("MLIT property-price history unexpectedly short");
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]!.obsDate;
    const expected = Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1);
    if (points[i]!.obsDate.getTime() !== expected) throw new Error("MLIT property-price monthly gap");
  }
  return points;
}

/** Download and hash-archive the official latest workbook advertised by MLIT. */
export async function fetchJpMlitPropertyPriceWorkbook(fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  const page = await fetch(JP_MLIT_PROPERTY_PRICE_URL, { signal: AbortSignal.timeout(30_000) });
  if (!page.ok) throw new Error(`MLIT property-price page HTTP ${page.status}`);
  const html = await page.text();
  if (!html.includes("不動産価格指数") || html.length < 10_000) throw new Error("MLIT property-price page changed");
  const match = /href=["']([^"']+\.xlsx)["']/i.exec(html);
  if (!match) throw new Error("MLIT property-price latest residential xlsx link missing");
  const url = new URL(match[1]!, JP_MLIT_PROPERTY_PRICE_URL).toString();
  const response = await fetch(url, { headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`MLIT property-price workbook HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 2).toString() !== "PK" || buffer.length < 20_000) throw new Error("MLIT property-price response is not an xlsx workbook");
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const directory = path.join(process.cwd(), ".data", "jp-mlit-property-price");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${sha256}.xlsx`), buffer, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  await writeFile(path.join(directory, "latest.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), url, sha256, parserVersion: 1 }, null, 2));
  return buffer;
}
