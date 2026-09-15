import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import {
  JP_MOF_EXTERNAL_POSITION_HISTORY_START,
  JP_MOF_EXTERNAL_POSITION_SERIES,
} from "./catalog";
import type { JpMofExternalPositionFiles } from "./client";

function parseBillionYen(value: unknown, context: string) {
  const raw = String(value ?? "").trim();
  const negative = /^\([\d,]+\)$/.test(raw);
  const normalized = raw.replace(/[(),\s]/g, "");
  if (!/^\d+$/.test(normalized)) throw new Error(`MOF external position invalid ${context}: ${raw}`);
  const parsed = Number(normalized) * (negative ? -1 : 1);
  if (!Number.isSafeInteger(parsed) || Math.abs(parsed) > 10_000_000) {
    throw new Error(`MOF external position implausible ${context}: ${raw}`);
  }
  return parsed;
}

function parseSheet(buffer: Buffer, sheetName: string, headerAnchor: string, minimumPoints: number) {
  if (buffer.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") {
    throw new Error("MOF external position input is not an XLS workbook");
  }
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`MOF external position missing sheet: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });
  const headerRows = rows.slice(0, 13);
  if (!headerRows.some((row) => String(row[5] ?? "").includes(headerAnchor))) {
    throw new Error(`MOF external position header changed: ${sheetName}/${headerAnchor}`);
  }
  if (!headerRows.flat().some((cell) => String(cell).includes("Billion Yen"))) {
    throw new Error(`MOF external position unit changed: ${sheetName}`);
  }
  const points: ObservationPoint[] = [];
  let year: number | undefined;
  let previousDate = 0;
  for (const row of rows.slice(13)) {
    const yearMatch = /^(\d{4})\/$/.exec(String(row[1] ?? "").trim());
    if (yearMatch) year = Number(yearMatch[1]);
    const monthRaw = String(row[2] ?? "").trim();
    if (!/^\d{1,2}$/.test(monthRaw)) continue;
    if (!year) throw new Error(`MOF external position row begins without year: ${sheetName}`);
    const month = Number(monthRaw);
    if (![3, 6, 9, 12].includes(month)) throw new Error(`MOF external position invalid quarter month: ${month}`);
    const obsDate = new Date(Date.UTC(year, month - 1, 1));
    if (previousDate) {
      const previous = new Date(previousDate);
      const expected = Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 3, 1);
      if (obsDate.getTime() !== expected) throw new Error(`MOF external position quarterly gap: ${sheetName}`);
    }
    previousDate = obsDate.getTime();
    points.push({ obsDate, value: parseBillionYen(row[5], `${sheetName}/${year}-${month}`) });
  }
  if (points.length < minimumPoints) throw new Error(`MOF external position history truncated: ${sheetName}`);
  if (points[0]?.obsDate.toISOString().slice(0, 10) !== JP_MOF_EXTERNAL_POSITION_HISTORY_START) {
    throw new Error(`MOF external position history start changed: ${sheetName}`);
  }
  return points;
}

/** Parse current-BPM6 quarterly estimates only. The source itself starts in
 * 2015Q1; older annual or BPM5 data are deliberately not spliced into it. */
export function parseJpMofExternalPositionFiles(
  files: JpMofExternalPositionFiles,
  minimumPoints = 40,
) {
  const output: Record<string, ObservationPoint[]> = {};
  for (const series of JP_MOF_EXTERNAL_POSITION_SERIES) {
    output[series.instrumentCode] = parseSheet(
      series.workbook === "iip" ? files.iip : files.debt,
      series.sheet,
      series.headerAnchor,
      minimumPoints,
    );
  }
  const coverage = new Set(
    Object.values(output).map(
      (points) => `${points.length}:${points[0]?.obsDate.toISOString()}:${points.at(-1)?.obsDate.toISOString()}`,
    ),
  );
  if (coverage.size !== 1) throw new Error("MOF external position selected series coverage mismatch");
  const assets = output.mof_jp_iip_total_assets_quarterly;
  const liabilities = output.mof_jp_iip_total_liabilities_quarterly;
  const net = output.mof_jp_iip_net_quarterly;
  for (let index = 0; index < assets.length; index++) {
    if (Math.abs(assets[index].value - liabilities[index].value - net[index].value) > 2) {
      throw new Error(`MOF external position identity failed at ${assets[index].obsDate.toISOString()}`);
    }
  }
  return output;
}
