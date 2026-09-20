import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import type { JpCycleLaborSeries } from "./catalog";

const asText = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
function number(v: unknown): number | undefined {
  if (v == null || ["", "-", "…", "...", "*"].includes(asText(v))) return undefined;
  const n = typeof v === "number" ? v : Number(asText(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Japan cycle/labor unexpected numeric value: ${asText(v)}`);
  return n;
}
function sortedUnique(points: ObservationPoint[], minimum: number, label: string) {
  points.sort((a, b) => +a.obsDate - +b.obsDate);
  if (points.length < minimum) throw new Error(`${label} history unexpectedly truncated`);
  for (let i = 1; i < points.length; i++) if (+points[i - 1].obsDate === +points[i].obsDate) throw new Error(`${label} duplicate period`);
  return points;
}

export function parseJpCycleLaborWorkbook(buffer: Buffer, series: JpCycleLaborSeries, now = new Date()): ObservationPoint[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (series.source === "ci") {
    const sheet = wb.Sheets[wb.SheetNames.find((name) => /Indexes|指数/.test(name)) ?? ""];
    if (!sheet) throw new Error("ESRI CI sheet missing");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    const anchors = rows.slice(0, 7).map((r) => r.map(asText).join(" ")).join(" ");
    if (!anchors.includes("Composite Indexes") || !anchors.includes("Leading Index")) throw new Error("ESRI CI workbook scope changed");
    const points: ObservationPoint[] = [];
    for (const row of rows) {
      const code = asText(row[0]);
      if (!/^\d{10}$/.test(code)) continue;
      const year = Number(code.slice(0, 4)), month = Number(code.slice(-2));
      const value = number(row[series.column]);
      if (!value) continue;
      const date = new Date(Date.UTC(year, month - 1, 1));
      if (date > now || year < 1980 || month < 1 || month > 12 || value < 20 || value > 250) throw new Error("ESRI CI invalid observation");
      points.push({ obsDate: date, value });
    }
    return sortedUnique(points, 450, "ESRI CI");
  }
  if (series.source === "unemployment") {
    const sheet = wb.Sheets[wb.SheetNames.find((name) => /季節調整/.test(name)) ?? ""];
    if (!sheet) throw new Error("LFS seasonal-adjustment sheet missing");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    const anchors = rows.slice(0, 10).map((r) => r.map(asText).join(" ")).join(" ");
    if (!anchors.includes("Unemployment rate") || !anchors.includes("Seasonally adjusted")) throw new Error("LFS workbook scope changed");
    const points: ObservationPoint[] = []; let year: number | undefined;
    for (const row of rows) {
      const first = row[0]; if (typeof first === "number" && first >= 1950 && first < 2100) year = first;
      const monthText = asText(row[1]); const match = /^(\d{1,2})月$/.exec(monthText);
      if (!year || !match) continue;
      const value = number(row[series.column]); if (value === undefined) continue;
      const date = new Date(Date.UTC(year, Number(match[1]) - 1, 1));
      if (date > now || value < 0 || value > 20) throw new Error("LFS unemployment invalid observation");
      points.push({ obsDate: date, value });
    }
    return sortedUnique(points, 700, "LFS unemployment");
  }
  const sheet = wb.Sheets[wb.SheetNames[0]]; if (!sheet) throw new Error("job-ratio sheet missing");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const anchors = rows.slice(0, 6).map((r) => r.map(asText).join(" ")).join(" ");
  if (!anchors.includes("有効求人倍率") || !anchors.includes("季節調整値")) throw new Error("job-ratio workbook scope changed");
  const points: ObservationPoint[] = [];
  for (const row of rows) {
    const m = /^(\d{4})年$/.exec(asText(row[0])); if (!m) continue;
    const year = Number(m[1]);
    for (let month = 1; month <= 12; month++) {
      const value = number(row[series.column + month - 1]); if (value === undefined) continue;
      const date = new Date(Date.UTC(year, month - 1, 1));
      if (date > now || value <= 0 || value > 10) throw new Error("job-ratio invalid observation");
      points.push({ obsDate: date, value });
    }
  }
  return sortedUnique(points, 700, "job-ratio");
}
