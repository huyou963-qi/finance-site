import { parseInvestingCalendarHtml } from "./parseHtml";
import type { FetchCalendarOptions, FetchCalendarResult } from "./types";

const FILTERED_URL =
  "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData";
const SSL_URL = "https://sslecal2.investing.com/fxeconomiccalendar.php";

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function defaultHeaders(): Record<string, string> {
  const cookie = process.env.INVESTING_CALENDAR_COOKIE?.trim();
  const h: Record<string, string> = {
    "User-Agent":
      process.env.INVESTING_CALENDAR_USER_AGENT?.trim() ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

async function fetchFilteredData(
  options: FetchCalendarOptions,
): Promise<{ html: string; status: number }> {
  const countryIds = options.countryIds?.length ? options.countryIds : [5, 6, 37, 35, 17, 72];
  const tz = options.timeZone ?? (Number(process.env.INVESTING_CALENDAR_TIMEZONE) || 8);
  const params = new URLSearchParams();
  params.set("dateFrom", formatDate(options.dateFrom));
  params.set("dateTo", formatDate(options.dateTo));
  params.set("timeZone", String(tz));
  params.set("timeFilter", "timeRemain");
  params.set("currentTab", "custom");
  params.set("limit_from", "0");
  params.set("importance", "1,2,3");
  for (const id of countryIds) {
    params.append("country[]", String(id));
  }

  const base = process.env.INVESTING_CALENDAR_API_BASE?.trim() || FILTERED_URL;
  const res = await fetch(base, {
    method: "POST",
    headers: {
      ...defaultHeaders(),
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://www.investing.com",
      Referer: "https://www.investing.com/economic-calendar/",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(45_000),
  });

  const text = await res.text();
  if (!res.ok) {
    return { html: "", status: res.status };
  }

  try {
    const json = JSON.parse(text) as { data?: string };
    return { html: json.data ?? "", status: res.status };
  } catch {
    return { html: text, status: res.status };
  }
}

async function fetchSslFallback(
  options: FetchCalendarOptions,
): Promise<{ html: string; status: number }> {
  const countryIds = options.countryIds?.length ? options.countryIds : [5, 6, 37, 35];
  const tz = options.timeZone ?? (Number(process.env.INVESTING_CALENDAR_TIMEZONE) || 8);
  const q = new URLSearchParams({
    timeZone: String(tz),
    timeFilter: "timeRemain",
    currentTab: "custom",
    limit_from: "0",
    limit_to: "200",
    importance: "1,2,3",
    countries: countryIds.join(","),
    calType: "week",
  });
  q.set("dateFrom", formatDate(options.dateFrom));
  q.set("dateTo", formatDate(options.dateTo));

  const res = await fetch(`${SSL_URL}?${q}`, {
    headers: defaultHeaders(),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  return { html: text, status: res.status };
}

/** 拉取 Investing.com 经济日历（主接口失败时尝试 ssl 备用） */
export async function fetchInvestingEconomicCalendar(
  options: FetchCalendarOptions,
): Promise<FetchCalendarResult> {
  const warnings: string[] = [];

  const primary = await fetchFilteredData(options);
  if (primary.status === 403) {
    warnings.push(
      "Investing 主接口 403：可在 .env.local 设置 INVESTING_CALENDAR_COOKIE（浏览器登录后复制 Cookie）或 INVESTING_CALENDAR_API_BASE 代理地址",
    );
  }

  let events = parseInvestingCalendarHtml(primary.html);
  if (events.length > 0) {
    return { events, source: "investing_filtered", warning: warnings.join(" ") || undefined };
  }

  const ssl = await fetchSslFallback(options);
  events = parseInvestingCalendarHtml(ssl.html);
  if (events.length > 0) {
    return {
      events,
      source: "investing_ssl",
      warning: warnings.length ? warnings.join(" ") : "已使用 ssl 备用端点",
    };
  }

  return {
    events: [],
    source: "empty",
    warning:
      warnings.join(" ") ||
      `未解析到日历事件（HTTP ${primary.status}/${ssl.status}）。请检查网络或 Cookie。`,
  };
}

/** 默认查询窗口：过去 1 天至未来 21 天 */
export function defaultCalendarWindow(from = new Date()): FetchCalendarOptions {
  const dateFrom = new Date(from);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - 1);
  const dateTo = new Date(from);
  dateTo.setUTCDate(dateTo.getUTCDate() + 21);
  return { dateFrom, dateTo };
}
