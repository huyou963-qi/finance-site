import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { JP_METI_RETAIL_SERIES } from "./catalog";

const SHEET = "販売額（value）(月次M)";
const MISSING = new Set(["", "***", "X", "-"]);

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function valueOf(raw: unknown): number | undefined {
  if (raw == null || MISSING.has(text(raw))) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const normalized = text(raw).replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`METI commerce unexpected value marker: ${text(raw)}`);
  }
  return Number(normalized);
}

/** Parse official nominal monthly sales levels only. The workbook also contains
 * official linked growth rates, but those are deliberately outside this catalog.
 * A series may have leading *** before METI began publishing that classification;
 * gaps are forbidden once a series starts. */
export function parseJpMetiRetailWorkbook(buffer: Buffer, now = new Date()) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) throw new Error(`METI commerce missing sheet ${SHEET}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });
  if (!text(rows[0]?.[0]).includes("業種別商業販売額")) {
    throw new Error("METI commerce workbook title changed");
  }
  const headerIndex = rows.findIndex(
    (row) => text(row[0]) === "時間軸コード" && text(row[1]) === "年月",
  );
  if (headerIndex < 2) throw new Error("METI commerce monthly header changed");
  const names = rows[headerIndex - 1] ?? [];
  const units = rows[headerIndex - 3] ?? [];
  const columns = new Map<string, number>();
  for (let column = 0; column < names.length; column++) {
    const name = text(names[column]);
    if (name) {
      if (columns.has(name)) throw new Error(`METI commerce duplicate column: ${name}`);
      columns.set(name, column);
    }
  }
  for (const series of JP_METI_RETAIL_SERIES) {
    const column = columns.get(series.sourceName);
    if (column == null) throw new Error(`METI commerce missing column: ${series.sourceName}`);
    if (text(units[column]) !== "10億円") throw new Error(`METI commerce unit changed: ${series.sourceName}`);
  }

  const dataRows = rows.slice(headerIndex + 1).filter((row) => /^\d{10}$/.test(text(row[0])));
  if (dataRows.length < 500) throw new Error("METI commerce history unexpectedly truncated");
  const parsed: Record<string, ObservationPoint[]> = {};
  for (const series of JP_METI_RETAIL_SERIES) {
    const column = columns.get(series.sourceName)!;
    const points: ObservationPoint[] = [];
    let started = false;
    for (const row of dataRows) {
      const code = text(row[0]);
      const match = /^(\d{4})00(\d{2})\2$/.exec(code);
      if (!match) throw new Error(`METI commerce invalid month code: ${code}`);
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (month < 1 || month > 12) throw new Error(`METI commerce invalid month: ${code}`);
      const obsDate = new Date(Date.UTC(year, month - 1, 1));
      if (obsDate > now) throw new Error(`METI commerce future observation: ${code}`);
      const value = valueOf(row[column]);
      if (value === undefined) {
        if (started) throw new Error(`METI commerce gap after series start: ${series.sourceName}/${code}`);
        continue;
      }
      started = true;
      if (value < 0 || value > 1_000_000) {
        throw new Error(`METI commerce implausible value: ${series.sourceName}/${code}`);
      }
      points.push({ obsDate, value });
    }
    if (points[0]?.obsDate.toISOString().slice(0, 10) !== series.historyStart) {
      throw new Error(`METI commerce history start changed: ${series.sourceName}`);
    }
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1].obsDate;
      if (points[index].obsDate.getTime() !== Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1)) {
        throw new Error(`METI commerce non-contiguous month: ${series.sourceName}`);
      }
    }
    parsed[series.instrumentCode] = points;
  }
  const ends = new Set(Object.values(parsed).map((points) => points.at(-1)?.obsDate.getTime()));
  if (ends.size !== 1) throw new Error("METI commerce component end dates disagree");
  return parsed;
}

