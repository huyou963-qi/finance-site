/** 自建流量统计：纯函数（客户端埋点与服务端共用，不依赖 DB）。 */

export const MAX_PATH_LEN = 300;
export const ANALYTICS_RANGE_DAYS = [7, 30, 90] as const;
export type AnalyticsRangeDays = (typeof ANALYTICS_RANGE_DAYS)[number];

export type DeviceType = "mobile" | "tablet" | "desktop";

export const DEVICE_LABELS: Record<DeviceType, string> = {
  mobile: "手机",
  tablet: "平板",
  desktop: "电脑",
};

/** 不统计的路径前缀（管理后台自身、接口） */
const EXCLUDED_PREFIXES = ["/admin", "/api"];

const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|preview|curl\/|wget|python-|node-fetch|axios|go-http|java\/|okhttp|scrapy|monitor|uptime|pingdom/i;

const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const SHANGHAI_OFFSET_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return BOT_RE.test(ua);
}

export function isValidClientId(v: unknown): v is string {
  return typeof v === "string" && CLIENT_ID_RE.test(v);
}

/** 去掉 query/hash 与尾部斜杠；非站内路径返回 null。 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.split(/[?#]/)[0] ?? "";
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "") || "/";
  try {
    p = decodeURIComponent(p);
  } catch {
    // 保留原样
  }
  return p.slice(0, MAX_PATH_LEN);
}

export function isTrackedPath(path: string): boolean {
  return !EXCLUDED_PREFIXES.some((pre) => path === pre || path.startsWith(`${pre}/`));
}

export function deviceTypeFromUserAgent(ua: string | null | undefined): DeviceType {
  if (!ua) return "desktop";
  if (/ipad|tablet|kindle|silk|playbook/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    return "tablet";
  }
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

/** 外站来源域名（去 www.）；站内跳转、空值、非法 URL 返回 null。 */
export function referrerHost(raw: unknown, selfHost: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw) return null;
  let host: string;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  const self = (selfHost ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (self && host === self) return null;
  return host.replace(/^www\./, "").slice(0, 255) || null;
}

/** 上海时区（UTC+8，无夏令时）自然日 YYYY-MM-DD */
export function shanghaiDayKey(d: Date): string {
  return new Date(d.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

/** 上海时区 daysBack 天前的 00:00，返回对应 UTC 时刻 */
export function shanghaiDayStart(now: Date, daysBack: number): Date {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack);
  return new Date(midnight - SHANGHAI_OFFSET_MS);
}

export function shanghaiDayKeys(start: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => shanghaiDayKey(new Date(start.getTime() + i * DAY_MS)));
}

export type AnalyticsDailyRow = { day: string; pv: number; uv: number; sessions: number };

export type AnalyticsSummary = {
  days: number;
  generatedAt: string;
  /** 近 30 分钟活跃访客 */
  onlineNow: number;
  today: { pv: number; uv: number };
  yesterday: { pv: number; uv: number };
  totals: { pv: number; uv: number; sessions: number; loggedInUsers: number; newVisitors: number };
  users: { total: number; newInRange: number };
  daily: AnalyticsDailyRow[];
  pages: { path: string; pv: number; uv: number }[];
  referrers: { host: string | null; sessions: number }[];
  devices: { device: DeviceType; uv: number }[];
};
