import type {
  EconomicCalendarEvent,
  FetchCalendarOptions,
  FetchCalendarResult,
} from "../economicCalendar/types";
import { teCalendarCountryCookieValue } from "./countries";
import {
  filterCalendarEventsByWindow,
  parseTradingEconomicsCalendarHtml,
} from "./parseHtml";

const DEFAULT_PAGE = "https://tradingeconomics.com/calendar";

/** TE 日历页 `calendar-range` 预设：5=本月，6=下月（见 TE 页 getDatesForCalendar） */
const DEFAULT_RANGE_PRESETS = ["5", "6"] as const;

type CalendarFetchPlan = {
  label: string;
  cookies: string[];
};

function defaultHeaders(extraCookie?: string): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent":
      process.env.TRADINGECONOMICS_USER_AGENT?.trim() ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const parts = [process.env.TE_CALENDAR_COOKIE?.trim(), extraCookie].filter(Boolean);
  if (parts.length) h.Cookie = parts.join("; ");
  return h;
}

function utcOffsetHours(): number {
  const raw = process.env.TE_CALENDAR_UTC_OFFSET_HOURS?.trim();
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function endOfNextCalendarMonth(from = new Date()): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  return new Date(Date.UTC(y, m + 2, 0, 23, 59, 59, 999));
}

function rangePresetsFromEnv(): string[] {
  const raw = process.env.TE_CALENDAR_RANGE_PRESETS?.trim();
  if (!raw) return [...DEFAULT_RANGE_PRESETS];
  const vals = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return vals.length ? vals : [...DEFAULT_RANGE_PRESETS];
}

function countryCookieParts(countryCodes?: string[]): string[] {
  if (!countryCodes?.length) return [];
  const value = teCalendarCountryCookieValue(countryCodes);
  return value ? [`calendar-countries=${value}`] : [];
}

/** 构造与浏览器「时间范围 + 国家」等价的 Cookie 组合 */
export function buildCalendarFetchPlans(options: FetchCalendarOptions): CalendarFetchPlan[] {
  const countryParts = countryCookieParts(options.countryCodes);
  const plans: CalendarFetchPlan[] = [];

  for (const preset of rangePresetsFromEnv()) {
    plans.push({
      label: `calendar-range=${preset}`,
      cookies: [`calendar-range=${preset}`, ...countryParts],
    });
  }

  if (options.dateTo.getTime() > endOfNextCalendarMonth().getTime()) {
    plans.push({
      label: `cal-custom-range=${ymdUtc(options.dateFrom)}|${ymdUtc(options.dateTo)}`,
      cookies: [`cal-custom-range=${ymdUtc(options.dateFrom)}|${ymdUtc(options.dateTo)}`, ...countryParts],
    });
  }

  return plans;
}

function mergeCalendarEvents(chunks: EconomicCalendarEvent[][]): EconomicCalendarEvent[] {
  const byId = new Map<string, EconomicCalendarEvent>();
  for (const events of chunks) {
    for (const e of events) {
      byId.set(e.eventId, e);
    }
  }
  return [...byId.values()].sort((a, b) => a.releaseAt.getTime() - b.releaseAt.getTime());
}

async function fetchCalendarHtml(plan: CalendarFetchPlan): Promise<string> {
  const pageUrl = process.env.TRADINGECONOMICS_CALENDAR_PAGE?.trim() || DEFAULT_PAGE;
  const cookie = plan.cookies.join("; ");
  const res = await fetch(pageUrl, {
    headers: defaultHeaders(cookie),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`${plan.label} HTTP ${res.status}`);
  }
  return res.text();
}

/** 从 TradingEconomics 公开日历页抓取（模拟浏览器 calendar-range / 国家 Cookie） */
export async function fetchTradingEconomicsCalendar(
  options: FetchCalendarOptions,
): Promise<FetchCalendarResult> {
  const plans = buildCalendarFetchPlans(options);
  const parsedChunks: EconomicCalendarEvent[][] = [];
  const errors: string[] = [];

  for (const plan of plans) {
    try {
      const html = await fetchCalendarHtml(plan);
      parsedChunks.push(
        parseTradingEconomicsCalendarHtml(html, {
          utcOffsetHours: utcOffsetHours(),
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${plan.label}: ${msg}`);
    }
  }

  const merged = mergeCalendarEvents(parsedChunks);
  const events = filterCalendarEventsByWindow(
    merged,
    options.dateFrom,
    options.dateTo,
    options.countryCodes,
  );

  if (events.length === 0) {
    return {
      events: [],
      source: "tradingeconomics_web",
      warning:
        merged.length === 0
          ? errors.length
            ? `TE 日历页抓取失败：${errors.join("; ")}`
            : "未从 TE 日历页解析到事件（页面结构可能变更或需 Cookie）"
          : "窗口/国家筛选后无匹配事件",
    };
  }

  return {
    events,
    source: "tradingeconomics_web",
    warning: errors.length ? `部分日历页抓取失败：${errors.join("; ")}` : undefined,
  };
}

/** 默认查询窗口：过去 1 天至未来 N 天（默认 90，可用 TE_CALENDAR_WINDOW_DAYS 覆盖） */
export function calendarWindowDays(): number {
  const raw = process.env.TE_CALENDAR_WINDOW_DAYS?.trim();
  if (raw == null || raw === "") return 90;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 7 ? Math.floor(n) : 90;
}

export function defaultCalendarWindow(from = new Date()): FetchCalendarOptions {
  const days = calendarWindowDays();
  const dateFrom = new Date(from);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - 1);
  const dateTo = new Date(from);
  dateTo.setUTCDate(dateTo.getUTCDate() + days);
  return { dateFrom, dateTo };
}

export type { EconomicCalendarEvent };
