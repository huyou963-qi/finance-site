import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import type { JpMhlwMonthlyLabourSeries } from "./catalog";

const MISSING = new Set(["", "-"]);

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numeric(value: unknown): number | undefined {
  if (value == null || MISSING.has(text(value))) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value).replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw new Error(`unexpected non-numeric marker: ${text(value)}`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`invalid numeric value: ${raw}`);
  return parsed;
}

/**
 * Parse only the first "Indices" section of the TL sheet. The second section
 * is year-on-year growth and is deliberately excluded: this catalog stores the
 * official base index only. All six tables must be nationwide, industries
 * covered, employment-type total, establishments with 5+ employees, 2020=100.
 */
export function parseJpMhlwMonthlyLabourWorkbook(
  buffer: Buffer,
  series: JpMhlwMonthlyLabourSeries,
  now = new Date(),
): ObservationPoint[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  if (!workbook.Sheets.TL) throw new Error("MHLW monthly labour workbook missing TL sheet");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.TL, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });
  const firstTen = rows.slice(0, 10).map((row) => row.map(text).join(" ")).join(" ");
  for (const required of [
    "毎月勤労統計調査",
    series.sourceTitle,
    "５人以上(Establishments with 5 or more employees)",
    "就業形態計(Total)",
    "調査産業計(Industries covered)",
    "2020 average = 100",
  ]) {
    if (!firstTen.includes(text(required))) throw new Error(`MHLW monthly labour scope/base changed: ${required}`);
  }
  const headerIndex = rows.findIndex(
    (row, index) =>
      index < 15 &&
      text(row[0]) === "年" &&
      Array.from({ length: 12 }, (_, month) => text(row[8 + month])).every(
        (value, month) => value === String(month + 1),
      ),
  );
  if (headerIndex < 0) throw new Error("MHLW monthly labour month header changed");
  const endIndex = rows.findIndex(
    (row, index) => index > headerIndex + 1 && text(row[0]).includes("毎月勤労統計調査"),
  );
  if (endIndex < 0) throw new Error("MHLW monthly labour index/growth section boundary missing");

  const seenYears = new Set<number>();
  const points: ObservationPoint[] = [];
  for (const row of rows.slice(headerIndex + 1, endIndex)) {
    if (row[0] == null || text(row[0]) === "") continue;
    if (text(row[0]).toLowerCase() === "year") continue;
    const year = Number(row[0]);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      throw new Error(`MHLW monthly labour unexpected index-section row: ${text(row[0])}`);
    }
    if (seenYears.has(year)) throw new Error(`MHLW monthly labour duplicate year: ${year}`);
    seenYears.add(year);
    for (let month = 1; month <= 12; month++) {
      const value = numeric(row[7 + month]);
      if (value === undefined) continue;
      if (value <= 0 || value >= 1_000) throw new Error(`MHLW monthly labour implausible value: ${value}`);
      const obsDate = new Date(Date.UTC(year, month - 1, 1));
      if (obsDate > now) throw new Error(`MHLW monthly labour future observation: ${year}-${month}`);
      points.push({ obsDate, value });
    }
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (points.length < 400 || points[0]?.obsDate.toISOString().slice(0, 10) !== "1990-01-01") {
    throw new Error("MHLW monthly labour history unexpectedly truncated");
  }
  for (let index = 1; index < points.length; index++) {
    const prior = points[index - 1].obsDate;
    const expected = Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + 1, 1);
    if (points[index].obsDate.getTime() !== expected) {
      throw new Error(`MHLW monthly labour non-contiguous month at ${points[index].obsDate.toISOString()}`);
    }
  }
  return points;
}
