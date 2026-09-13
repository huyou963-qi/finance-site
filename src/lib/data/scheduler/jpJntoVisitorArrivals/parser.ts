import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import {
  JP_JNTO_VISITOR_ARRIVALS_HISTORY_START,
  JP_JNTO_VISITOR_ARRIVALS_PAGE_URL,
  JP_JNTO_VISITOR_ARRIVALS_SERIES,
} from "./catalog";

export type JpJntoVisitorArrivalsParsed = {
  series: Record<string, ObservationPoint[]>;
  sourceLatestObsDate: Date;
};

const compact = (value: unknown) => String(value ?? "").replace(/\s+/g, "").trim();

function integerValue(value: unknown, context: string): number | undefined {
  if (value == null || compact(value) === "") return undefined;
  const normalized = compact(value).replace(/,/g, "");
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`JNTO visitor arrivals unexpected value at ${context}: ${String(value)}`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 20_000_000) {
    throw new Error(`JNTO visitor arrivals implausible value at ${context}: ${String(value)}`);
  }
  return parsed;
}

/**
 * Discover the rolling JNTO official XLSX by its semantic anchor. The filename
 * changes on every release, so pinning the current timestamped URL would stop
 * updates. Multiple matching links are rejected rather than guessed.
 */
export function parseJpJntoVisitorArrivalsPage(html: string): string {
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: match[1],
      text: compact(match[2].replace(/<[^>]+>/g, " ")),
    }))
    .filter(
      (link) =>
        /\.xlsx(?:\?|$)/i.test(link.href) &&
        link.text.includes("国籍/月別") &&
        link.text.includes("訪日外客数"),
    );
  if (links.length !== 1) {
    throw new Error(`JNTO visitor arrivals expected one official time-series XLSX; found ${links.length}`);
  }
  return new URL(links[0].href, JP_JNTO_VISITOR_ARRIVALS_PAGE_URL).toString();
}

function parseYearSheet(workbook: XLSX.WorkBook, year: number, now: Date) {
  const sheet = workbook.Sheets[String(year)];
  if (!sheet) throw new Error(`JNTO visitor arrivals missing sheet ${year}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });
  const title = rows.slice(0, 3).flat().map(compact).join("|");
  if (!title.includes(`${year}年訪日外客数（総数）`)) {
    throw new Error(`JNTO visitor arrivals title changed on sheet ${year}`);
  }

  const monthColumns = new Map<number, number>();
  for (const row of rows.slice(0, 8)) {
    for (let column = 0; column < row.length; column++) {
      const match = /^(\d{1,2})月$/.exec(compact(row[column]));
      if (!match) continue;
      const month = Number(match[1]);
      if (month < 1 || month > 12 || monthColumns.has(month)) {
        throw new Error(`JNTO visitor arrivals duplicate/invalid month header on sheet ${year}`);
      }
      monthColumns.set(month, column);
    }
  }
  if (monthColumns.size !== 12) {
    throw new Error(`JNTO visitor arrivals expected 12 month headers on sheet ${year}; found ${monthColumns.size}`);
  }

  const output: Record<string, ObservationPoint[]> = {};
  for (const definition of JP_JNTO_VISITOR_ARRIVALS_SERIES) {
    const candidates = rows.filter((row) => row.some((cell) => compact(cell) === definition.sourceRowLabel));
    if (candidates.length !== 1) {
      throw new Error(
        `JNTO visitor arrivals expected one ${definition.sourceRowLabel} row on sheet ${year}; found ${candidates.length}`,
      );
    }
    const row = candidates[0];
    const points: ObservationPoint[] = [];
    let reachedTrailingBlank = false;
    for (let month = 1; month <= 12; month++) {
      const value = integerValue(row[monthColumns.get(month)!], `${year}-${String(month).padStart(2, "0")}/${definition.sourceRowLabel}`);
      if (value === undefined) {
        reachedTrailingBlank = true;
        continue;
      }
      if (reachedTrailingBlank) {
        throw new Error(`JNTO visitor arrivals non-trailing gap at ${year}-${month}/${definition.sourceRowLabel}`);
      }
      const obsDate = new Date(Date.UTC(year, month - 1, 1));
      if (obsDate > now) {
        throw new Error(`JNTO visitor arrivals future observation at ${year}-${month}/${definition.sourceRowLabel}`);
      }
      points.push({ obsDate, value });
    }
    if (year < now.getUTCFullYear() && points.length !== 12) {
      throw new Error(`JNTO visitor arrivals incomplete historical sheet ${year}/${definition.sourceRowLabel}`);
    }
    output[definition.instrumentCode] = points;
  }
  return output;
}

/**
 * Official workbook layout:
 * - one sheet per year (2003 onward), newest first;
 * - one header row contains 1月 ... 12月, interleaved with 伸率 (YoY);
 * - the data row begins with a nationality/region label;
 * - recent sheets insert a blank spacer column, so columns are located by header;
 * - only monthly level columns are parsed; annual totals and YoY formulas are excluded.
 *
 * The rolling workbook rewrites estimates to provisional and then definitive
 * values. The parser returns the complete current-vintage surface so the common
 * upsert/vintage layer can capture those revisions.
 */
export function parseJpJntoVisitorArrivalsWorkbook(
  buffer: Buffer,
  now = new Date(),
): JpJntoVisitorArrivalsParsed {
  if (buffer.subarray(0, 2).toString() !== "PK") {
    throw new Error("JNTO visitor arrivals response is not an XLSX workbook");
  }
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false });
  const years = workbook.SheetNames.map((name) => {
    if (!/^\d{4}$/.test(name)) throw new Error(`JNTO visitor arrivals unexpected sheet: ${name}`);
    return Number(name);
  }).sort((a, b) => a - b);
  if (years[0] !== 2003 || years.at(-1)! < now.getUTCFullYear() - 1) {
    throw new Error(`JNTO visitor arrivals history/current year coverage changed: ${years[0]}-${years.at(-1)}`);
  }
  for (let index = 1; index < years.length; index++) {
    if (years[index] !== years[index - 1] + 1) {
      throw new Error(`JNTO visitor arrivals non-contiguous year sheets: ${years[index - 1]}-${years[index]}`);
    }
  }

  const series = Object.fromEntries(
    JP_JNTO_VISITOR_ARRIVALS_SERIES.map((definition) => [definition.instrumentCode, [] as ObservationPoint[]]),
  );
  for (const year of years) {
    const yearSeries = parseYearSheet(workbook, year, now);
    for (const definition of JP_JNTO_VISITOR_ARRIVALS_SERIES) {
      series[definition.instrumentCode].push(...yearSeries[definition.instrumentCode]);
    }
  }

  const coverage = new Set(
    Object.values(series).map(
      (points) => `${points.length}:${points[0]?.obsDate.toISOString()}:${points.at(-1)?.obsDate.toISOString()}`,
    ),
  );
  if (coverage.size !== 1) throw new Error("JNTO visitor arrivals selected series coverage mismatch");
  for (const [code, points] of Object.entries(series)) {
    if (points.length < 280 || points[0]?.obsDate.toISOString().slice(0, 10) !== JP_JNTO_VISITOR_ARRIVALS_HISTORY_START) {
      throw new Error(`JNTO visitor arrivals history truncated: ${code}`);
    }
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1].obsDate;
      const expected = Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1);
      if (points[index].obsDate.getTime() !== expected) {
        throw new Error(`JNTO visitor arrivals non-contiguous month: ${code}`);
      }
    }
  }
  return {
    series,
    sourceLatestObsDate: Object.values(series)[0].at(-1)!.obsDate,
  };
}

