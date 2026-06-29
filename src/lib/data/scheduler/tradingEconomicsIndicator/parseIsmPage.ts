import { ISM_SECTOR_TO_TE_LABEL } from "./ismCatalog";
import type { EconomicCalendarEvent } from "../economicCalendar/types";
import { parseTeCalendarReleaseAt } from "../tradingEconomicsCalendar/parseHtml";

export type TeIsmSeriesPoint = {
  label: string;
  value: number;
  previous: number | null;
  referenceText: string;
  obsDate: Date;
  /** TE 页面发布日（calendar 行），可为空 */
  releaseDate: Date | null;
};

export type TeIsmParsedPage = {
  headline: TeIsmSeriesPoint | null;
  components: TeIsmSeriesPoint[];
  /** calendar 表最新一条含 Actual 的发布 */
  latestCalendarRelease: {
    calendarDate: Date;
    referenceText: string;
    actual: number;
  } | null;
  fetchedAt: string;
};

export type TeIsmCalendarRow = {
  eventId: string;
  calendarDate: Date;
  timeRaw: string;
  referenceText: string;
  actual: number | null;
};

const MONTH_ABBR: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumber(raw: string): number | null {
  const s = raw.replace(/[,%\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseCalendarDate(raw: string): Date | null {
  const s = raw.trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) {
    return new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
  }
  return null;
}

/** "May 2026" / "May" + releaseDate → 观测月首日 UTC */
export function referenceTextToObsDate(
  referenceText: string,
  releaseDate?: Date | null,
): Date | null {
  const ref = referenceText.trim();
  const full = /^([A-Za-z]{3,9})\s+(\d{4})$/.exec(ref);
  if (full) {
    const mon = MONTH_ABBR[full[1]!.slice(0, 3).toLowerCase()];
    if (mon == null) return null;
    return new Date(Date.UTC(Number(full[2]), mon, 1));
  }

  const abbr = /^([A-Za-z]{3,9})$/.exec(ref);
  if (abbr && releaseDate) {
    const mon = MONTH_ABBR[abbr[1]!.slice(0, 3).toLowerCase()];
    if (mon == null) return null;
    let year = releaseDate.getUTCFullYear();
    if (mon > releaseDate.getUTCMonth()) year -= 1;
    return new Date(Date.UTC(year, mon, 1));
  }
  return null;
}

function extractTableChunk(html: string, headerLabel: string): string | null {
  const marker = `>${headerLabel}</th>`;
  const headerIdx = html.indexOf(marker);
  if (headerIdx < 0) return null;
  const tableStart = html.lastIndexOf("<table", headerIdx);
  if (tableStart < 0) return null;
  const tableEnd = html.indexOf("</table>", headerIdx);
  if (tableEnd < 0) return null;
  return html.slice(tableStart, tableEnd + "</table>".length);
}

function parseDatatableRows(tableHtml: string): TeIsmSeriesPoint[] {
  const out: TeIsmSeriesPoint[] = [];
  const trRe =
    /<tr[^>]*class=['"]datatable-row[^'"]*['"][^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(tableHtml))) {
    const row = m[1]!;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) =>
      stripTags(x[1] ?? ""),
    );
    if (tds.length < 5) continue;
    const label = tds[0]!;
    const value = parseNumber(tds[1] ?? "");
    if (value == null || !label) continue;
    const previous = parseNumber(tds[2] ?? "");
    const referenceText = tds[4] ?? tds[3] ?? "";
    const obsDate = referenceTextToObsDate(referenceText);
    if (!obsDate) continue;
    out.push({
      label,
      value,
      previous,
      referenceText,
      obsDate,
      releaseDate: null,
    });
  }
  return out;
}

function parseIsmCalendarRowBody(eventId: string, row: string): TeIsmCalendarRow | null {
  const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) =>
    stripTags(x[1] ?? ""),
  );
  if (tds.length < 4) return null;

  const calendarDate = parseCalendarDate(tds[0] ?? "");
  if (!calendarDate) return null;

  const timeRaw = tds[1] ?? "";
  const referenceText = tds[2]?.match(/^[A-Za-z]{3,9}/)?.[0] ?? tds[3] ?? "";
  const actualRaw =
    row.match(/id="actual"[^>]*>([\s\S]*?)<\/td>/i)?.[1] != null
      ? stripTags(row.match(/id="actual"[^>]*>([\s\S]*?)<\/td>/i)![1] ?? "")
      : (tds[4] ?? "");
  const actual = parseNumber(actualRaw);
  const refFromId = stripTags(
    row.match(/id="reference"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "",
  );
  const resolvedRef = refFromId || referenceText;
  if (!resolvedRef) return null;

  return {
    eventId,
    calendarDate,
    timeRaw,
    referenceText: resolvedRef,
    actual,
  };
}

function parseCalendarTableChunk(chunk: string): TeIsmCalendarRow[] {
  const rows: TeIsmCalendarRow[] = [];

  const trRe =
    /<tr[^>]*data-id="(\d+)"[^>]*class=['"][^'"]*an-estimate-row[^'"]*['"][^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(chunk))) {
    const parsed = parseIsmCalendarRowBody(m[1]!, m[2]!);
    if (parsed) rows.push(parsed);
  }

  return rows;
}

function extractCalendarTableHtml(html: string): string | null {
  const calIdx = html.indexOf('id="calendar"');
  if (calIdx < 0) return null;
  const tableStart = html.lastIndexOf("<table", calIdx);
  const tableEnd = html.indexOf("</table>", calIdx);
  if (tableStart < 0 || tableEnd < 0) return null;
  return html.slice(tableStart, tableEnd + "</table>".length);
}

/** 解析 TE ISM 页 #calendar 表全部行（含尚未公布 Actual 的未来发布） */
export function parseIsmCalendarRows(html: string): TeIsmCalendarRow[] {
  const chunk = extractCalendarTableHtml(html);
  if (!chunk) return [];
  return parseCalendarTableChunk(chunk);
}

/** 从 ISM 指标页 calendar 表取下一次发布（headline 与全部分项共用） */
export function parseNextIsmCalendarRelease(
  html: string,
  from: Date = new Date(),
  utcOffsetHours = 0,
): EconomicCalendarEvent | null {
  const fromMs = from.getTime();
  const candidates = parseIsmCalendarRows(html)
    .map((row) => {
      const releaseAt = parseTeCalendarReleaseAt(
        row.calendarDate.toISOString().slice(0, 10),
        row.timeRaw,
        utcOffsetHours,
      );
      return releaseAt ? { row, releaseAt } : null;
    })
    .filter((x): x is { row: TeIsmCalendarRow; releaseAt: Date } => x != null)
    .filter((x) => x.releaseAt.getTime() >= fromMs - 60_000)
    .sort((a, b) => a.releaseAt.getTime() - b.releaseAt.getTime());

  const pick = candidates[0];
  if (!pick) return null;

  return {
    eventId: pick.row.eventId,
    title: "ISM Manufacturing PMI",
    countryCode: "US",
    releaseAt: pick.releaseAt,
    importance: null,
    currency: null,
  };
}

function parseCalendarTable(html: string): TeIsmParsedPage["latestCalendarRelease"] {
  const rows = parseIsmCalendarRows(html)
    .map((row) => {
      if (row.actual == null) return null;
      return {
        calendarDate: row.calendarDate,
        referenceText: row.referenceText,
        actual: row.actual,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (rows.length === 0) return null;
  rows.sort((a, b) => b.calendarDate.getTime() - a.calendarDate.getTime());
  return rows[0]!;
}

function pickHeadline(
  related: TeIsmSeriesPoint[],
  components: TeIsmSeriesPoint[],
  calendar: TeIsmParsedPage["latestCalendarRelease"],
): TeIsmSeriesPoint | null {
  const fromRelated = related.find((r) => r.label === "ISM Manufacturing PMI");
  if (fromRelated) {
    const obsDate = calendar
      ? referenceTextToObsDate(calendar.referenceText, calendar.calendarDate) ??
        fromRelated.obsDate
      : fromRelated.obsDate;
    return {
      ...fromRelated,
      value: calendar?.actual ?? fromRelated.value,
      referenceText: calendar?.referenceText ?? fromRelated.referenceText,
      obsDate,
      releaseDate: calendar?.calendarDate ?? null,
    };
  }

  if (calendar) {
    const obsDate = referenceTextToObsDate(calendar.referenceText, calendar.calendarDate);
    if (obsDate) {
      return {
        label: "ISM Manufacturing PMI",
        value: calendar.actual,
        previous: null,
        referenceText: calendar.referenceText,
        obsDate,
        releaseDate: calendar.calendarDate,
      };
    }
  }

  const composite = components.find((c) => c.label === "ISM Manufacturing PMI");
  return composite ?? null;
}

/** 解析 TE business-confidence 页：headline + 7 个分项 */
export function parseTradingEconomicsIsmPage(html: string): TeIsmParsedPage {
  const componentsChunk = extractTableChunk(html, "Components");
  const relatedChunk = extractTableChunk(html, "Related");
  const components = componentsChunk ? parseDatatableRows(componentsChunk) : [];
  const related = relatedChunk ? parseDatatableRows(relatedChunk) : [];
  const latestCalendarRelease = parseCalendarTable(html);
  const headline = pickHeadline(related, components, latestCalendarRelease);

  return {
    headline,
    components,
    latestCalendarRelease,
    fetchedAt: new Date().toISOString(),
  };
}

export function seriesPointForTeLabel(
  parsed: TeIsmParsedPage,
  teLabel: string,
): TeIsmSeriesPoint | null {
  if (teLabel === ISM_SECTOR_TO_TE_LABEL.headline) {
    return parsed.headline;
  }
  return parsed.components.find((c) => c.label === teLabel) ?? null;
}

export function seriesPointForSector(
  parsed: TeIsmParsedPage,
  sector: string,
): TeIsmSeriesPoint | null {
  const label = ISM_SECTOR_TO_TE_LABEL[sector];
  if (!label) return null;
  return seriesPointForTeLabel(parsed, label);
}
