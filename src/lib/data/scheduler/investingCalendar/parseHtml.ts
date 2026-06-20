import { INVESTING_FLAG_TO_ISO } from "./countries";
import type { EconomicCalendarEvent } from "./types";

function parseEventDatetime(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // 2026/05/31 08:30:00 或 2026-05-31 08:30:00
  const norm = s.replace(/\//g, "-");
  const d = new Date(norm.includes("T") ? norm : norm.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) {
    const m = norm.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return new Date(
      Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6] ?? 0),
      ),
    );
  }
  return d;
}

function extractCountryFromRow(rowHtml: string): string | null {
  const flag = rowHtml.match(/flagCur[_\s][^"]*"[^"]*">([^<]+)</i);
  if (flag?.[1]) {
    const key = flag[1].trim().toUpperCase();
    return INVESTING_FLAG_TO_ISO[key] ?? (key.length === 2 ? key : null);
  }
  const titleCountry = rowHtml.match(/title="([^"]{2,3})"/i);
  if (titleCountry?.[1]) {
    const key = titleCountry[1].trim().toUpperCase();
    return INVESTING_FLAG_TO_ISO[key] ?? (key.length === 2 ? key : null);
  }
  return null;
}

function extractTitle(rowHtml: string): string {
  const eventTd = rowHtml.match(/class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
  if (eventTd?.[1]) {
    const text = eventTd[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  const titleAttr = rowHtml.match(/title="([^"]{4,})"/i);
  return titleAttr?.[1]?.trim() ?? "";
}

function extractImportance(rowHtml: string): number | null {
  const bulls = (rowHtml.match(/GrayBulish|bullish|icon-font\b/gi) ?? []).length;
  if (bulls >= 3) return 3;
  if (bulls === 2) return 2;
  if (bulls === 1) return 1;
  const star = rowHtml.match(/data-img_key="(\d)"/);
  if (star?.[1]) return Number(star[1]);
  return null;
}

/** 解析 getCalendarFilteredData 或 ssl 端点返回的 HTML 片段 */
export function parseInvestingCalendarHtml(html: string): EconomicCalendarEvent[] {
  if (!html?.trim()) return [];

  const events: EconomicCalendarEvent[] = [];
  const rowRe =
    /<tr[^>]*(?:event_attr_ID|event_attr_id)="(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;

  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const eventId = m[1];
    const fullRow = m[0];
    const rowBody = m[2] ?? "";
    const dtRaw =
      fullRow.match(/data-event-datetime="([^"]+)"/i)?.[1] ??
      rowBody.match(/data-event-datetime="([^"]+)"/i)?.[1];
    if (!dtRaw) continue;

    const releaseAt = parseEventDatetime(dtRaw);
    if (!releaseAt) continue;

    const title = extractTitle(fullRow);
    if (!title) continue;

    events.push({
      eventId,
      title,
      countryCode: extractCountryFromRow(fullRow),
      releaseAt,
      importance: extractImportance(fullRow),
      currency: null,
    });
  }

  return events.sort((a, b) => a.releaseAt.getTime() - b.releaseAt.getTime());
}
