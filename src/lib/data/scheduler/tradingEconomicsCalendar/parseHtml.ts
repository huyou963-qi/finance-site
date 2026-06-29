import { isoFromTeCountryName } from "./countries";
import type { EconomicCalendarEvent } from "../economicCalendar/types";

function parseTime12h(raw: string): { hour: number; minute: number } | null {
  const s = raw.replace(/\s+/g, " ").trim();
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3]!.toUpperCase() === "PM") hour += 12;
  return { hour, minute: Number(m[2]) };
}

function parseRowDate(rowHtml: string): string | null {
  const m =
    rowHtml.match(/class='[^']*\s(\d{4}-\d{2}-\d{2})/) ??
    rowHtml.match(/class="[^"]*\s(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

function parseRowTime(rowHtml: string): string | null {
  const m = rowHtml.match(
    /<span[^>]*class="[^"]*calendar-date[^"]*"[^>]*>\s*([\d:]+\s*(?:AM|PM))\s*<\/span>/i,
  );
  return m?.[1]?.trim() ?? null;
}

function parseRowTitle(rowHtml: string, dataEvent: string): string {
  const link = rowHtml.match(
    /<a[^>]*class=['"]calendar-event['"][^>]*>([\s\S]*?)<\/a>/i,
  );
  if (link?.[1]) {
    const text = link[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return dataEvent.replace(/\s+/g, " ");
}

/** TE 日历/指标页上的本地日期+12h 时间 → UTC */
export function parseTeCalendarReleaseAt(
  dateYmd: string,
  timeRaw: string,
  utcOffsetHours: number,
): Date | null {
  const [y, mo, d] = dateYmd.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const tm = parseTime12h(timeRaw);
  if (!tm) return null;
  const localMs = Date.UTC(y, mo - 1, d, tm.hour, tm.minute, 0);
  return new Date(localMs - utcOffsetHours * 3_600_000);
}

/** 解析 tradingeconomics.com/calendar 页面 HTML（无需 API Key） */
export function parseTradingEconomicsCalendarHtml(
  html: string,
  options?: { utcOffsetHours?: number },
): EconomicCalendarEvent[] {
  if (!html?.trim()) return [];

  const utcOffsetHours = options?.utcOffsetHours ?? 0;
  const events: EconomicCalendarEvent[] = [];
  const rowOpenRe =
    /<tr[^>]*data-id="(\d+)"[^>]*data-country="([^"]+)"[^>]*data-event="([^"]+)"[^>]*>/gi;

  let m: RegExpExecArray | null;
  while ((m = rowOpenRe.exec(html)) !== null) {
    const eventId = m[1]!;
    const countrySlug = m[2]!.trim().toLowerCase();
    const dataEvent = m[3]!.trim().toLowerCase();
    const rowBody = html.slice(m.index!, m.index! + 6000);

    const dateYmd = parseRowDate(rowBody);
    const timeRaw = parseRowTime(rowBody);
    if (!dateYmd || !timeRaw) continue;

    const releaseAt = parseTeCalendarReleaseAt(dateYmd, timeRaw, utcOffsetHours);
    if (!releaseAt || Number.isNaN(releaseAt.getTime())) continue;

    const title = parseRowTitle(rowBody, dataEvent);
    events.push({
      eventId,
      title,
      countryCode: isoFromTeCountryName(countrySlug),
      releaseAt,
      importance: null,
      currency: null,
    });
  }

  events.sort((a, b) => a.releaseAt.getTime() - b.releaseAt.getTime());
  return events;
}

export function filterCalendarEventsByWindow(
  events: EconomicCalendarEvent[],
  dateFrom: Date,
  dateTo: Date,
  countryCodes?: string[],
): EconomicCalendarEvent[] {
  const fromMs = dateFrom.getTime();
  const toMs = dateTo.getTime() + 86_400_000;
  const ccSet = countryCodes?.length
    ? new Set(countryCodes.map((c) => c.toUpperCase()))
    : null;

  return events.filter((e) => {
    const t = e.releaseAt.getTime();
    if (t < fromMs || t > toMs) return false;
    if (ccSet && e.countryCode && !ccSet.has(e.countryCode.toUpperCase())) return false;
    if (ccSet && !e.countryCode) return false;
    return true;
  });
}
