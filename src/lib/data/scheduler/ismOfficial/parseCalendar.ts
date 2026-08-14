/**
 * 解析 ISM 官网发布日历页（rob-report-calendar）。
 *
 * 结构（2026 核实）：表头 Month / Manufacturing PMI / Services PMI；
 * 行是 "January 2026" + 当月发布日（可能带 * 脚注）。
 * 发布时刻：美东 10:00（官网写 EST，按 America/New_York 解释夏令时）。
 * 跳过 Supply Chain Planning Forecast 等非 PMI 行。
 * 表缺失或 0 条 PMI 日期 → throw，禁止静默空日历。
 */
import type { EconomicCalendarEvent } from "../economicCalendar/types";
import { ISM_OFFICIAL_PACKAGE_IDS, type IsmOfficialReportKind } from "./catalog";
import { civilTimeInZoneToUtc } from "./civilTime";

export const ISM_RELEASE_HOUR_ET = 10;
export const ISM_RELEASE_MINUTE_ET = 0;
export const ISM_RELEASE_TIME_ZONE = "America/New_York";

const MONTH_NAME_TO_NUM: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export type IsmOfficialRelease = {
  kind: IsmOfficialReportKind;
  /** 日历表「Month」列：发布月份（1–12） */
  releaseMonth: number;
  releaseYear: number;
  releaseDay: number;
  releaseAt: Date;
};

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDayCell(raw: string): number | null {
  const m = stripTags(raw).replace(/\*/g, "").match(/^(\d{1,2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  return day >= 1 && day <= 31 ? day : null;
}

function parseMonthYearCell(raw: string): { month: number; year: number } | null {
  const s = stripTags(raw);
  const m = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i.exec(
    s,
  );
  if (!m) return null;
  const month = MONTH_NAME_TO_NUM[m[1]!.toLowerCase()];
  if (!month) return null;
  return { month, year: Number(m[2]) };
}

function extractTables(html: string): string[] {
  const out: string[] = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[0]!);
  return out;
}

function extractRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(tableHtml))) {
    const cells = [...m[1]!.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((x) =>
      stripTags(x[1] ?? ""),
    );
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function isCalendarHeader(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return joined.includes("manufacturing") && joined.includes("services") && joined.includes("month");
}

function toReleaseAt(year: number, month: number, day: number): Date {
  return civilTimeInZoneToUtc(
    year,
    month,
    day,
    ISM_RELEASE_HOUR_ET,
    ISM_RELEASE_MINUTE_ET,
    ISM_RELEASE_TIME_ZONE,
  );
}

/** HTML → 制造业/服务业 PMI 发布时刻（不含 Forecast 行） */
export function parseIsmOfficialCalendarPage(html: string): IsmOfficialRelease[] {
  if (/content you are looking for is no longer available/i.test(html)) {
    throw new Error("ISM 官网日历页不可用（content no longer available）");
  }

  const tables = extractTables(html);
  let header: string[] | null = null;
  let dataRows: string[][] = [];

  for (const table of tables) {
    const rows = extractRows(table);
    const headerIdx = rows.findIndex(isCalendarHeader);
    if (headerIdx < 0) continue;
    header = rows[headerIdx]!;
    dataRows = rows.slice(headerIdx + 1);
    break;
  }

  if (!header) {
    throw new Error("ISM 官网日历：未找到 Manufacturing/Services PMI 日期表（页面结构可能已变）");
  }

  const out: IsmOfficialRelease[] = [];
  for (const cells of dataRows) {
    if (cells.length < 3) continue;
    const ym = parseMonthYearCell(cells[0] ?? "");
    if (!ym) continue;
    const mfgDay = parseDayCell(cells[1] ?? "");
    const svcDay = parseDayCell(cells[2] ?? "");
    if (mfgDay != null) {
      out.push({
        kind: "manufacturing",
        releaseMonth: ym.month,
        releaseYear: ym.year,
        releaseDay: mfgDay,
        releaseAt: toReleaseAt(ym.year, ym.month, mfgDay),
      });
    }
    if (svcDay != null) {
      out.push({
        kind: "services",
        releaseMonth: ym.month,
        releaseYear: ym.year,
        releaseDay: svcDay,
        releaseAt: toReleaseAt(ym.year, ym.month, svcDay),
      });
    }
  }

  if (out.length === 0) {
    throw new Error("ISM 官网日历：表存在但未解析到任何 PMI 发布日");
  }
  return out.sort((a, b) => a.releaseAt.getTime() - b.releaseAt.getTime());
}

export function nextIsmOfficialRelease(
  releases: IsmOfficialRelease[],
  kind: IsmOfficialReportKind,
  from: Date = new Date(),
): IsmOfficialRelease | null {
  const fromMs = from.getTime() - 60_000;
  return releases.find((r) => r.kind === kind && r.releaseAt.getTime() >= fromMs) ?? null;
}

export function ismOfficialReleaseToCalendarEvent(
  release: IsmOfficialRelease,
): EconomicCalendarEvent {
  const title =
    release.kind === "manufacturing" ? "ISM Manufacturing PMI" : "ISM Services PMI";
  return {
    eventId: `ism-official:${release.kind}:${release.releaseYear}-${String(release.releaseMonth).padStart(2, "0")}-${String(release.releaseDay).padStart(2, "0")}`,
    title,
    countryCode: "US",
    releaseAt: release.releaseAt,
    importance: null,
    currency: null,
  };
}

export function packageIdToIsmKind(packageId: string): IsmOfficialReportKind | null {
  if (packageId === ISM_OFFICIAL_PACKAGE_IDS.manufacturing) return "manufacturing";
  if (packageId === ISM_OFFICIAL_PACKAGE_IDS.services) return "services";
  return null;
}
