import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { NYFED_HHDC_SERIES } from "./catalog";

const normalize = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export function parseHhdcQuarter(raw: unknown): Date | null {
  if (raw instanceof Date && Number.isFinite(raw.getTime())) {
    return new Date(Date.UTC(raw.getUTCFullYear(), Math.floor(raw.getUTCMonth() / 3) * 3, 1));
  }
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d || d.y < 1999 || d.y > 2100) return null;
    return new Date(Date.UTC(d.y, Math.floor((d.m - 1) / 3) * 3, 1));
  }
  const match = /^(\d{2}|\d{4}):Q([1-4])$/.exec(String(raw ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  return new Date(Date.UTC(year < 100 ? (year >= 99 ? 1900 : 2000) + year : year, (Number(match[2]) - 1) * 3, 1));
}

export function parseHhdcWorkbook(wb: XLSX.WorkBook, code: string): ObservationPoint[] {
  const def = NYFED_HHDC_SERIES.find(row => row.code === code);
  if (!def) throw new Error(`Unknown HHDC series: ${code}`);
  const sheets = wb.SheetNames.filter(name => !name.startsWith("Chart")).map(name =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null }));
  const matches = sheets.filter(rows => rows.slice(0, 3).some(row => normalize(row[0]) === normalize(def.title)));
  if (matches.length !== 1) throw new Error(`HHDC title missing or ambiguous: ${def.title}`);
  const rows = matches[0];
  if (!rows.slice(0, 4).some(row => normalize(row[0]) === normalize(def.sourceUnit))) throw new Error(`HHDC unit changed: ${code}`);
  const header = rows.findIndex(row => row.some(cell => normalize(cell) === normalize(def.column)));
  if (header < 0) throw new Error(`HHDC column missing: ${def.column}`);
  const col = rows[header].findIndex(cell => normalize(cell) === normalize(def.column));
  const points: ObservationPoint[] = [];
  const seen = new Set<number>();
  for (const row of rows.slice(header + 1)) {
    const obsDate = parseHhdcQuarter(row[0]);
    if (!obsDate) continue;
    const value = row[col];
    if (value == null || value === "") continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (def.unit === "%" && value > 100)) throw new Error(`HHDC invalid value: ${code}`);
    if (seen.has(obsDate.getTime())) throw new Error(`HHDC duplicate quarter: ${code}`);
    seen.add(obsDate.getTime());
    points.push({ obsDate, value });
  }
  if (!points.length) throw new Error(`HHDC empty series: ${code}`);
  return points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
}

export function discoverHhdcWorkbook(html: string): string {
  const candidates = [...html.matchAll(/(?:https:\/\/www\.newyorkfed\.org)?\/medialibrary\/interactives\/householdcredit\/data\/xls\/HHD_C_Report_(\d{4})Q([1-4])(?:\.xlsx?)?/gi)]
    .map(m => ({ path: m[0], quarter: Number(m[1]) * 4 + Number(m[2]) }));
  candidates.sort((a, b) => b.quarter - a.quarter);
  if (!candidates.length) throw new Error("HHDC official download link missing");
  return new URL(candidates[0].path, NYFED_ORIGIN).href;
}
const NYFED_ORIGIN = "https://www.newyorkfed.org";
