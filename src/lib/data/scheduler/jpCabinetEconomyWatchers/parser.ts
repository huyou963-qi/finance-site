import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { JP_CAO_WATCHERS_SERIES } from "./catalog";

export type JpCaoWatchersParsed = {
  series: Record<string, ObservationPoint[]>;
  sourceLatestObsDate: Date;
};

const compact = (value: unknown) => String(value ?? "").replace(/\s+/g, "").trim();

function numeric(value: unknown, context: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = compact(value).replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) {
    throw new Error(`Cabinet Office Economy Watchers non-numeric value at ${context}: ${String(value)}`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`Cabinet Office Economy Watchers invalid value at ${context}`);
  return parsed;
}

function parseSheet(
  workbook: XLSX.WorkBook,
  sheetName: "分野別（現状）" | "分野別（先行き)",
  now: Date,
): Record<string, ObservationPoint[]> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Cabinet Office Economy Watchers missing sheet: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });
  const targets = JP_CAO_WATCHERS_SERIES.filter((row) => row.sheet === sheetName);
  const heading = rows.slice(0, 6).flat().map(compact).join("|");
  const expectedHeading = sheetName.includes("現状") ? "景気の現状判断（方向性）ＤＩ" : "景気の先行き判断（方向性）ＤＩ";
  if (!heading.includes(compact(expectedHeading))) {
    throw new Error(`Cabinet Office Economy Watchers heading changed: ${sheetName}`);
  }
  if (compact(rows[3]?.[3]) !== "合計" || compact(rows[3]?.[4]) !== "家計動向関連" ||
      compact(rows[3]?.[9]) !== "企業動向関連" || compact(rows[3]?.[12]) !== "雇用関連") {
    throw new Error(`Cabinet Office Economy Watchers component headers changed: ${sheetName}`);
  }

  const output = Object.fromEntries(targets.map((target) => [target.instrumentCode, [] as ObservationPoint[]]));
  let year: number | undefined;
  let previousDate: Date | undefined;
  for (let rowIndex = 6; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const yearText = compact(row[1]);
    if (yearText) {
      const match = /^(\d{4})年$/.exec(yearText);
      if (!match) {
        if (row.every((value) => compact(value) === "")) continue;
        throw new Error(`Cabinet Office Economy Watchers unexpected year marker at row ${rowIndex + 1}: ${yearText}`);
      }
      year = Number(match[1]);
    }
    const monthText = compact(row[2]);
    if (!monthText) {
      if (row.some((value) => compact(value) !== "")) {
        throw new Error(`Cabinet Office Economy Watchers unexpected non-data row ${rowIndex + 1}`);
      }
      continue;
    }
    const month = Number(monthText);
    if (!year || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error(`Cabinet Office Economy Watchers invalid date at row ${rowIndex + 1}`);
    }
    const obsDate = new Date(Date.UTC(year, month - 1, 1));
    if (obsDate > now) throw new Error(`Cabinet Office Economy Watchers future observation: ${year}-${month}`);
    if (previousDate) {
      const expected = Date.UTC(previousDate.getUTCFullYear(), previousDate.getUTCMonth() + 1, 1);
      if (obsDate.getTime() !== expected) {
        throw new Error(`Cabinet Office Economy Watchers non-contiguous or duplicate month: ${year}-${month}`);
      }
    }
    previousDate = obsDate;
    for (const target of targets) {
      const value = numeric(row[target.column], `${sheetName}!row${rowIndex + 1}/col${target.column + 1}`);
      if (value < 0 || value > 100) {
        throw new Error(`Cabinet Office Economy Watchers DI out of range at ${year}-${month}: ${value}`);
      }
      output[target.instrumentCode].push({ obsDate, value });
    }
  }

  for (const target of targets) {
    const points = output[target.instrumentCode];
    if (points.length < 290 || points[0]?.obsDate.toISOString().slice(0, 10) !== "2002-01-01") {
      throw new Error(`Cabinet Office Economy Watchers history truncated: ${target.instrumentCode}`);
    }
  }
  return output;
}

/**
 * Official watcher5.xls layout (validated rather than inferred positionally):
 * - two source sheets: national sector DI for current conditions and outlook;
 * - row 4/5 contains merged sector headers, data begins at row 7;
 * - year appears only on January rows and month is a separate integer column;
 * - selected source columns are total, household-related, corporate-related and employment-related.
 *
 * The Cabinet Office annually recalculates seasonal factors and revises the full
 * published history. Therefore the parser deliberately returns every month.
 */
export function parseJpCaoWatchersWorkbook(buffer: Buffer, now = new Date()): JpCaoWatchersParsed {
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false });
  if (workbook.SheetNames[0] !== "分野別（現状）" || !workbook.SheetNames.includes("分野別（先行き)")) {
    throw new Error("Cabinet Office Economy Watchers workbook/sheet order changed");
  }
  const firstRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["分野別（現状）"], {
    header: 1, raw: true, defval: null,
  }).slice(0, 2).flat().map(compact).join("|");
  if (!firstRows.includes("全国の分野別ＤＩの推移（季節調整値）")) {
    throw new Error("Cabinet Office Economy Watchers seasonal-adjustment scope changed");
  }
  const current = parseSheet(workbook, "分野別（現状）", now);
  const outlook = parseSheet(workbook, "分野別（先行き)", now);
  const series = { ...current, ...outlook };
  const coverages = Object.values(series).map((points) => `${points.length}:${points.at(-1)?.obsDate.toISOString()}`);
  if (new Set(coverages).size !== 1) throw new Error("Cabinet Office Economy Watchers series coverage mismatch");
  return { series, sourceLatestObsDate: Object.values(series)[0].at(-1)!.obsDate };
}

export function parseJpCaoWatchersIndexPage(html: string): string {
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ href: match[1], text: compact(match[2].replace(/<[^>]+>/g, " ")) }))
    .filter((link) => link.text.includes("全国の分野・業種別、地域別ＤＩの推移") && /\.xls(?:\?|$)/i.test(link.href));
  if (links.length !== 1) throw new Error(`Cabinet Office Economy Watchers expected one seasonal workbook link; found ${links.length}`);
  return new URL(links[0].href, "https://www5.cao.go.jp/keizai3/watcher.html").toString();
}
