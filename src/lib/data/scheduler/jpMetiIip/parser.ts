import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { JP_METI_IIP_SERIES } from "./catalog";

/** Official e-Stat workbook, 2020 base. Four named sheets; header row is anchored
 * by 品目番号/品目名称, NOT the ten-digit 時系列コード row above it. Months
 * are YYYYMM or 'p YYYYMM' (preliminary); target row 1000000000 + 鉱工業.
 * Retain the workbook as source evidence: it contains preliminary markers and
 * retroactive seasonal revisions. Never splice earlier base-year files here.
 */
export function parseJpMetiIipWorkbook(buffer: Buffer, now = new Date()) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const result: Record<string, { points: ObservationPoint[]; preliminaryDates: string[] }> = {};
  for (const config of JP_METI_IIP_SERIES) {
    const sheet = workbook.Sheets[config.sheet];
    if (!sheet) throw new Error(`METI IIP missing sheet ${config.sheet}`);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    const title = String(rows[0]?.[0]);
    if (!title.includes("季節調整済指数【月次】") || !title.includes("2020＝100.0") || !title.includes(config.sheet)) {
      throw new Error(`METI IIP base/frequency/adjustment changed: ${title}`);
    }
    const headerIndex = rows.findIndex((row) => row[0] === "品目番号" && row[1] === "品目名称");
    if (headerIndex < 0) throw new Error("METI IIP missing month header");
    const headers = rows[headerIndex];
    const targets = rows.slice(headerIndex + 1).filter((row) => String(row[0]) === "1000000000");
    if (targets.length !== 1 || targets[0][1] !== "鉱工業") throw new Error("METI IIP ambiguous industry code/name");
    const points: ObservationPoint[] = [];
    const preliminaryDates: string[] = [];
    let previous = -1;
    for (let col = 3; col < headers.length; col++) {
      const raw = String(headers[col]).trim();
      const match = /^(p\s+)?(\d{4})(\d{2})$/.exec(raw);
      if (!match) throw new Error(`METI IIP invalid month: ${raw}`);
      const year = Number(match[2]), month = Number(match[3]);
      const ordinal = year * 12 + month - 1;
      if (year < 2018 || month < 1 || month > 12 || (previous !== -1 && ordinal !== previous + 1)) throw new Error(`METI IIP non-contiguous/invalid month: ${raw}`);
      const obsDate = new Date(Date.UTC(year, month - 1, 1));
      if (obsDate > now) throw new Error(`METI IIP future month: ${raw}`);
      const value = targets[0][col];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1000) throw new Error(`METI IIP invalid ${config.sheet} value at ${raw}: ${String(value)}`);
      points.push({ obsDate, value });
      if (match[1]) preliminaryDates.push(obsDate.toISOString().slice(0, 10));
      previous = ordinal;
    }
    if (points.length < 12 || points[0].obsDate.toISOString().slice(0, 10) !== "2018-01-01") throw new Error("METI IIP history unexpectedly truncated");
    result[config.instrumentCode] = { points, preliminaryDates };
  }
  const ends = new Set(Object.values(result).map((v) => v.points.at(-1)!.obsDate.getTime()));
  if (ends.size !== 1) throw new Error("METI IIP component periods disagree");
  return result;
}
