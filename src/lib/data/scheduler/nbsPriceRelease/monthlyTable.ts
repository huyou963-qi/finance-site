import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";

export const compactReleaseLabel = (value: unknown) => String(value ?? "").replace(/\s+/g, "").replace(/^其中[：:]/, "");
const finite = (value: unknown): number | null => {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Official 5-column monthly/cumulative attachment, never a derived rate. */
export function parseMonthlyReleaseTable(workbook: XLSX.WorkBook, domain: "INDUSTRIAL" | "RETAIL") {
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error(`NBS ${domain}: missing release sheet`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const title = rows.slice(0, 3).flat().map(String).join("");
  const expected = domain === "INDUSTRIAL" ? /规模以上工业生产主要数据/ : /社会消费品零售总额主要数据/;
  const period = /(?:^|[^\d])(20\d{2})年(?:1[—－-])?(\d{1,2})月份/.exec(title);
  if (!expected.test(title) || !period || +period[2]! < 1 || +period[2]! > 12) throw new Error(`NBS ${domain}: release title/period changed`);
  const header = rows.findIndex(row => row.some(cell => compactReleaseLabel(cell) === "指标"));
  const offset = rows[header]?.findIndex(cell => compactReleaseLabel(cell) === "指标") ?? -1;
  const columns = rows.slice(header, header + 4).flat().map(compactReleaseLabel).join("");
  if (header < 0 || offset < 0 || !/绝对量/.test(columns) || !/同比增长/.test(columns)) throw new Error(`NBS ${domain}: release columns changed`);
  for (let column = 0; column < 4; column++) {
    const heading = rows.slice(header + 1, header + 4).map(row => compactReleaseLabel(row[offset + 1 + column])).join("");
    if (!(column % 2 ? /同比增长/ : /绝对量/).test(heading)) throw new Error(`NBS ${domain}: monthly/cumulative column order changed`);
  }
  const obsDate = new Date(Date.UTC(+period[1]!, +period[2]! - 1, 1));
  const values = new Map<string, readonly (number | null)[]>();
  for (const row of rows.slice(header + 1)) {
    const label = compactReleaseLabel(row[offset]);
    const data = row.slice(offset + 1, offset + 5).map(finite);
    if (!label || data.length !== 4 || data.every(v => v === null)) continue;
    if (values.has(label)) throw new Error(`NBS ${domain}: duplicate release row ${label}`);
    values.set(label, data);
  }
  if (values.size < 3) throw new Error(`NBS ${domain}: empty release table`);
  return { obsDate, values };
}

/** API same-period revisions take precedence; press fills only a newer period. */
export function mergeNewReleasePoint(points: readonly ObservationPoint[], release?: ObservationPoint): ObservationPoint[] {
  const sorted = [...points].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (release && (!sorted.length || release.obsDate > sorted.at(-1)!.obsDate)) sorted.push(release);
  return sorted;
}
