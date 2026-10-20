import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";

export const MANHEIM_MUVVI_REPORTS_URL = "https://www.coxautoinc.com/insights/?insight_series=manheim-used-vehicle-index";
const COX_ORIGIN = "https://www.coxautoinc.com";
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export type OfficialManheimReport = { month: string; reportUrl: string; workbookUrl: string };

/** The archive includes mid-month checkpoints. Only a monthly final report is eligible. */
export function findLatestOfficialReport(html: string): { month: string; reportUrl: string } {
  const matches = [...html.matchAll(/href=["'](https:\/\/www\.coxautoinc\.com\/insights\/manheim-used-vehicle-value-index-([a-z]+)-(\d{4})-trends\/?)["']/gi)];
  const reports = matches.flatMap((match) => {
    const month = MONTHS.indexOf(match[2]!.toLowerCase());
    return month < 0 ? [] : [{ month: `${match[3]}-${String(month + 1).padStart(2, "0")}`, reportUrl: match[1]! }];
  });
  reports.sort((a, b) => b.month.localeCompare(a.month));
  if (!reports[0]) throw new Error("Cox Manheim archive has no monthly final report");
  return reports[0];
}

export function findOfficialWorkbookUrl(html: string): string {
  const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi);
  for (const anchor of anchors) {
    if (!/Download the Data/i.test(anchor[2]!.replace(/<[^>]*>/g, " "))) continue;
    const href = anchor[1]!.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const url = new URL(href, COX_ORIGIN);
    if (url.origin === COX_ORIGIN && /^\/wp-content\/uploads\/\d{4}\/\d{2}\/.+\.xlsx$/i.test(url.pathname)) return url.href;
  }
  throw new Error("Cox Manheim final report has no official XLSX download");
}

export function parseOfficialManheimWorkbook(buffer: Buffer, expectedMonth: string): ObservationPoint[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets.DATA;
  if (!sheet) throw new Error("Cox Manheim workbook has no DATA sheet");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  if (String(rows[0]?.[1] ?? "").trim() !== "Index (1/97 = 100)") throw new Error("Cox Manheim index column or base changed");
  const points: ObservationPoint[] = [];
  for (const row of rows.slice(1)) {
    const serial = row[0];
    const value = row[1];
    if (serial == null && value == null) continue;
    if (typeof serial !== "number" || typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1000) {
      throw new Error("Cox Manheim workbook contains an invalid date or index value");
    }
    const date = XLSX.SSF.parse_date_code(serial);
    // The official workbook labels Jan 2002 as Jan 2; observation identity is monthly.
    if (!date || date.y < 1997 || date.m < 1 || date.m > 12) throw new Error("Cox Manheim workbook contains an invalid month");
    const obsDate = new Date(Date.UTC(date.y, date.m - 1, 1));
    if (points.length) {
      const previous = points.at(-1)!.obsDate;
      const next = new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1));
      if (obsDate.getTime() !== next.getTime()) throw new Error("Cox Manheim workbook has a duplicate or missing month");
    }
    // Stable storage precision prevents PostgreSQL/driver float text rounding from
    // making an unchanged official value look like a revision on every probe.
    points.push({ obsDate, value: Number(value.toFixed(10)) });
  }
  if (points.length < 300 || points[0]?.obsDate.toISOString().slice(0, 7) !== "1997-01" || Math.abs(points[0].value - 100) > 0.000001) {
    throw new Error("Cox Manheim workbook history or base changed");
  }
  if (points.at(-1)!.obsDate.toISOString().slice(0, 7) !== expectedMonth) {
    throw new Error(`Cox Manheim report month ${expectedMonth} does not match workbook`);
  }
  return points;
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { "User-Agent": "finance-site-data-scheduler/1.0", Accept: "text/html,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Cox Manheim HTTP ${response.status}: ${url}`);
  return response;
}

export async function fetchOfficialManheimHistory(): Promise<{ points: ObservationPoint[]; report: OfficialManheimReport }> {
  const latest = findLatestOfficialReport(await (await get(MANHEIM_MUVVI_REPORTS_URL)).text());
  const workbookUrl = findOfficialWorkbookUrl(await (await get(latest.reportUrl)).text());
  const response = await get(workbookUrl);
  if (Number(response.headers.get("content-length") ?? 0) > 5_000_000) throw new Error("Cox Manheim workbook is unexpectedly large");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 5_000_000) throw new Error("Cox Manheim workbook is unexpectedly large");
  return { points: parseOfficialManheimWorkbook(buffer, latest.month), report: { ...latest, workbookUrl } };
}
