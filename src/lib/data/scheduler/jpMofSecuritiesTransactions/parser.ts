import type { ObservationPoint } from "../types";
import {
  JP_MOF_SECURITIES_HISTORY_START,
  JP_MOF_SECURITIES_SERIES,
} from "./catalog";

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("MOF securities malformed quoted CSV");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function numberValue(raw: string, context: string) {
  const normalized = raw.replace(/,/g, "").trim();
  if (!/^-?\d+$/.test(normalized)) throw new Error(`MOF securities invalid ${context}: ${raw}`);
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || Math.abs(value) > 10_000_000) {
    throw new Error(`MOF securities implausible ${context}: ${raw}`);
  }
  return value;
}

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/**
 * The rolling historical CSV republishes acquisitions and dispositions from
 * 2005 onward. We calculate current-semantics net acquisition (acquisition minus
 * disposition) from those gross official fields and validate each published net
 * column. This avoids carrying the sign display used in releases before 2014.
 * Equity expands to include investment-fund shares from 2014 and is marked as a
 * definition break in instrument metadata.
 */
export function parseJpMofSecuritiesCsv(text: string, minimumPoints = 250) {
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  if (!rows.slice(0, 3).flat().some((cell) => cell.includes("International Transactions in Securities"))) {
    throw new Error("MOF securities title changed");
  }
  if (!rows.slice(0, 8).flat().some((cell) => cell.includes("Unit: 100 mil Yen"))) {
    throw new Error("MOF securities unit changed");
  }
  const englishHeader = rows.find((row) => row.includes("Acquisition") && row.includes("Disposition"));
  if (
    !englishHeader ||
    englishHeader.length < 25 ||
    !englishHeader[5]?.startsWith("Net") ||
    !englishHeader[24]?.startsWith("Net")
  ) {
    throw new Error("MOF securities selected column layout changed");
  }
  const output: Record<string, ObservationPoint[]> = Object.fromEntries(
    JP_MOF_SECURITIES_SERIES.map((series) => [series.instrumentCode, []]),
  );
  let year: number | undefined;
  let previousDate = 0;
  let reachedPlaceholder = false;
  for (const row of rows) {
    const declaredYear = /^\d{4}$/.test(row[0]?.trim() ?? "") ? Number(row[0]) : undefined;
    if (declaredYear) year = declaredYear;
    const month = MONTHS[row[2]?.trim() ?? ""];
    if (!month) continue;
    if (!year || row.length < 25) throw new Error("MOF securities malformed monthly row");
    const selectedColumns = [3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24];
    if (selectedColumns.every((column) => !(row[column]?.trim()))) {
      reachedPlaceholder = true;
      continue;
    }
    if (reachedPlaceholder) throw new Error("MOF securities nonblank data after trailing placeholder");
    const obsDate = new Date(Date.UTC(year, month - 1, 1));
    if (previousDate) {
      const previous = new Date(previousDate);
      const expected = Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1);
      if (obsDate.getTime() !== expected) throw new Error("MOF securities monthly history has a gap");
    }
    previousDate = obsDate.getTime();
    const values = row.map((cell, column) =>
      selectedColumns.includes(column)
        ? numberValue(cell, `${year}-${month}/column-${column}`)
        : 0,
    );
    const checks: Array<[number, number]> = [
      [values[3] - values[4], values[5]],
      [values[6] - values[7], values[8]],
      [values[10] - values[11], values[12]],
      [values[14] - values[15], values[16]],
      [values[17] - values[18], values[19]],
      [values[21] - values[22], values[23]],
    ];
    if (checks.some(([calculated, published]) => Math.abs(calculated - published) > 1)) {
      throw new Error(`MOF securities net identity changed at ${year}-${month}`);
    }
    const seriesValues = {
      mof_jp_securities_resident_foreign_equity_net: values[3] - values[4],
      mof_jp_securities_resident_foreign_debt_net:
        values[6] - values[7] + values[10] - values[11],
      mof_jp_securities_nonresident_japan_equity_net: values[14] - values[15],
      mof_jp_securities_nonresident_japan_debt_net:
        values[17] - values[18] + values[21] - values[22],
    };
    for (const [code, value] of Object.entries(seriesValues)) output[code].push({ obsDate, value });
  }
  for (const [code, points] of Object.entries(output)) {
    if (points.length < minimumPoints) throw new Error(`MOF securities history truncated: ${code}`);
    if (points[0]?.obsDate.toISOString().slice(0, 10) !== JP_MOF_SECURITIES_HISTORY_START) {
      throw new Error(`MOF securities history start changed: ${code}`);
    }
  }
  return output;
}
