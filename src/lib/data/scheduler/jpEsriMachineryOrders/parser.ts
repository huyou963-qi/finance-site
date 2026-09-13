import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import {
  JP_ESRI_MACHINERY_ORDERS_PAGE_URL,
  type JpEsriMachineryOrdersSeries,
} from "./catalog";

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parsePositiveNumber(value: unknown): number | undefined {
  const raw = text(value);
  if (!raw || raw === "-" || raw === "…") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = raw.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`ESRI machinery orders unexpected value: ${raw}`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`ESRI machinery orders invalid numeric value: ${raw}`);
  }
  return parsed;
}

/** Discover the current long-run sector workbook from ESRI's release index. */
export function discoverJpEsriMachineryOrdersWorkbookUrl(html: string): string {
  if (!html.includes("機械受注統計調査報告") || !html.includes("主要長期時系列統計表")) {
    throw new Error("ESRI machinery orders index anchors missing");
  }
  const candidates = [...html.matchAll(/href=["']([^"']+\/(\d{2})(\d{2})chouki-1\.xlsx)["']/gi)]
    .map((match) => ({ href: match[1], year: Number(match[2]), month: Number(match[3]) }))
    .filter((item) => item.month >= 1 && item.month <= 12);
  if (candidates.length === 0) {
    throw new Error("ESRI machinery orders long-run workbook link missing");
  }
  candidates.sort((a, b) => a.year - b.year || a.month - b.month);
  return new URL(candidates.at(-1)!.href, JP_ESRI_MACHINERY_ORDERS_PAGE_URL).toString();
}

/** Parse one independently published SA monthly aggregate from the workbook. */
export function parseJpEsriMachineryOrdersWorkbook(
  buffer: Buffer,
  series: JpEsriMachineryOrdersSeries,
  now = new Date(),
): ObservationPoint[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["季調・月次"];
  if (!sheet) throw new Error("ESRI machinery orders SA monthly sheet missing");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  });
  const scope = rows.slice(0, 9).map((row) => row.map(text).join(" ")).join(" ");
  for (const anchor of [
    "主要需要者別受注額(季調系列・月次)",
    "Machinery Orders by Sectors",
    "(単位:100万円)",
  ]) {
    if (!scope.includes(anchor)) {
      throw new Error(`ESRI machinery orders workbook scope changed: ${anchor}`);
    }
  }
  const fingerprint = rows
    .slice(3, 9)
    .map((row) => text(row[series.column]))
    .filter(Boolean)
    .join(" | ");
  if (fingerprint !== series.headerFingerprint) {
    throw new Error(
      `ESRI machinery orders column changed for ${series.instrumentCode}: ${fingerprint}`,
    );
  }

  const points: ObservationPoint[] = [];
  const seen = new Set<number>();
  for (const row of rows.slice(9)) {
    const yearText = text(row[0]);
    const monthText = text(row[1]);
    if (!/^\d{4}$/.test(yearText) || !/^\d{1,2}$/.test(monthText)) continue;
    const year = Number(yearText);
    const month = Number(monthText);
    if (year < 2005 || year > 2100 || month < 1 || month > 12) {
      throw new Error(`ESRI machinery orders invalid period: ${yearText}-${monthText}`);
    }
    const value = parsePositiveNumber(row[series.column]);
    if (value === undefined) continue;
    if (value <= 0 || value >= 100_000_000) {
      throw new Error(`ESRI machinery orders implausible value: ${value}`);
    }
    const obsDate = new Date(Date.UTC(year, month - 1, 1));
    if (obsDate > now) {
      throw new Error(`ESRI machinery orders future period: ${yearText}-${monthText}`);
    }
    if (seen.has(obsDate.getTime())) {
      throw new Error(`ESRI machinery orders duplicate period: ${yearText}-${monthText}`);
    }
    seen.add(obsDate.getTime());
    points.push({ obsDate, value });
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (
    points.length < 250 ||
    points[0]?.obsDate.toISOString().slice(0, 10) !== "2005-04-01"
  ) {
    throw new Error("ESRI machinery orders history unexpectedly truncated");
  }
  for (let index = 1; index < points.length; index += 1) {
    const prior = points[index - 1].obsDate;
    const expected = new Date(Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + 1, 1));
    if (points[index].obsDate.getTime() !== expected.getTime()) {
      throw new Error(`ESRI machinery orders monthly gap after ${prior.toISOString()}`);
    }
  }
  return points;
}
