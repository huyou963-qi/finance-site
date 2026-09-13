import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numeric(value: unknown): number | undefined {
  if (value == null || text(value) === "" || text(value) === "***") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value).replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) {
    throw new Error(`ESRI consumer confidence unexpected value: ${text(value)}`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`ESRI consumer confidence invalid value: ${raw}`);
  return parsed;
}

/** Parse the official long-run SA workbook, preserving the survey's published breaks. */
export function parseJpEsriConsumerConfidenceWorkbook(
  buffer: Buffer,
  series: { column: number },
  now = new Date(),
): ObservationPoint[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames.find((name) =>
    /seasonally adjusted/i.test(name),
  );
  if (!sheetName) throw new Error("ESRI consumer confidence SA sheet missing");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("ESRI consumer confidence SA worksheet missing");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });
  const headerText = rows.slice(0, 8).map((row) => row.map(text).join(" ")).join(" ");
  for (const anchor of [
    "Consumer Confidence Index",
    "Households of two or more persons",
    "seasonally adjusted series",
  ]) {
    if (!headerText.includes(anchor)) {
      throw new Error(`ESRI consumer confidence workbook scope changed: ${anchor}`);
    }
  }
  const header = rows.find((row) => text(row[series.column]).includes("消費者"));
  if (!header) throw new Error(`ESRI consumer confidence column missing: ${series.column}`);

  const points: ObservationPoint[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const periodCode = text(row[0]);
    if (!/^\d{10}$/.test(periodCode)) continue;
    const year = Number(periodCode.slice(0, 4));
    const month = Number(periodCode.slice(-2));
    if (!Number.isInteger(year) || year < 1982 || year > 2100 || month < 1 || month > 12) {
      throw new Error(`ESRI consumer confidence invalid period: ${periodCode}`);
    }
    const value = numeric(row[series.column]);
    if (value === undefined) continue;
    if (value < 0 || value > 100) {
      throw new Error(`ESRI consumer confidence implausible value: ${value}`);
    }
    const obsDate = new Date(Date.UTC(year, month - 1, 1));
    if (obsDate > now) throw new Error(`ESRI consumer confidence future period: ${periodCode}`);
    const time = obsDate.getTime();
    if (seen.has(time)) throw new Error(`ESRI consumer confidence duplicate period: ${periodCode}`);
    seen.add(time);
    points.push({ obsDate, value });
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (
    points.length < 340 ||
    points[0]?.obsDate.toISOString().slice(0, 10) !== "1982-06-01"
  ) {
    throw new Error("ESRI consumer confidence history unexpectedly truncated");
  }
  return points;
}
