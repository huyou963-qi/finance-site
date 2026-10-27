import { civilTimeInZoneToUtc } from "@/lib/data/scheduler/civilTime";

const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
export function easternParts(at: Date) {
  const parts = formatter.formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)!.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")), minute: Number(value("minute")), second: Number(value("second")) };
}

/** SGML ACCEPTANCE-DATETIME is an Eastern wall clock, never a UTC string. */
export function parseSecAcceptanceTime(source: string): Date | null {
  const raw = source.match(/(?:<|&lt;)ACCEPTANCE-DATETIME(?:>|&gt;)\s*(\d{14})/i)?.[1];
  if (!raw) return null;
  const year = Number(raw.slice(0, 4)), month = Number(raw.slice(4, 6)), day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10)), minute = Number(raw.slice(10, 12)), second = Number(raw.slice(12));
  if (hour > 23 || minute > 59 || second > 59) return null;
  const date = civilTimeInZoneToUtc(year, month, day, hour, minute, "America/New_York");
  date.setUTCSeconds(second);
  const expected = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const matches = (candidate: Date) => {
    const local = easternParts(candidate);
    return local.date === expected && local.hour === hour && local.minute === minute && local.second === second;
  };
  if (!matches(date) || matches(new Date(date.getTime() - 3600_000)) || matches(new Date(date.getTime() + 3600_000))) return null;
  return date;
}

const CLOSED = new Set([
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);
const EARLY = new Set(["2025-07-03", "2025-11-28", "2025-12-24", "2026-11-27", "2026-12-24", "2027-11-26"]);
/** Versioned from the official NYSE 2025–2027 calendar; no extrapolated holiday guesses. */
export function equitySession(day: string): { open: boolean; closeMinute: number } | null {
  if (day < "2025-01-01" || day > "2027-12-31") return null;
  const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
  return { open: !weekend && !CLOSED.has(day), closeMinute: EARLY.has(day) ? 13 * 60 : 16 * 60 };
}
export type DisclosureSession = "before-open" | "regular" | "after-close" | "closed" | "unknown";
export function disclosureSession(at?: Date | null): DisclosureSession {
  if (!at || !Number.isFinite(at.getTime())) return "unknown";
  const local = easternParts(at), session = equitySession(local.date);
  if (!session) return "unknown";
  if (!session.open) return "closed";
  const minute = local.hour * 60 + local.minute;
  return minute < 570 ? "before-open" : minute >= session.closeMinute ? "after-close" : "regular";
}
const shiftDay = (day: string, offset: number) => { const date = new Date(day); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
function adjacentSession(day: string, direction: 1 | -1) {
  for (let offset = 1; offset <= 10; offset++) {
    const candidate = shiftDay(day, offset * direction), session = equitySession(candidate);
    if (!session) return null;
    if (session.open) return candidate;
  }
  return null;
}
export type EventReaction = { value: number | null; status: "available" | "unknown-time" | "intraday" | "calendar-unavailable" | "prices-pending";
  basis: "company-release" | "sec-accepted"; baselineDate: string | null; targetDate: string | null; label: string };
export function eventReaction(at: Date | null, basis: EventReaction["basis"], bars: readonly { date: string; close: number }[], now = new Date()): EventReaction {
  const result: EventReaction = { value: null, status: "unknown-time", basis, baselineDate: null, targetDate: null,
    label: basis === "company-release" ? "公司发布时刻待确认" : "SEC 接收时刻待核验" };
  if (!at || !Number.isFinite(at.getTime())) return result;
  const local = easternParts(at), session = disclosureSession(at);
  if (session === "unknown") return { ...result, status: "calendar-unavailable", label: "交易日历尚未核对" };
  if (session === "regular") return { ...result, status: "intraday", label: "盘中披露，日线无法隔离即时反应" };
  const target = session === "before-open" ? local.date : adjacentSession(local.date, 1);
  const baseline = target ? adjacentSession(target, -1) : null;
  if (!target || !baseline) return { ...result, status: "calendar-unavailable", label: "交易日历尚未核对" };
  result.baselineDate = baseline; result.targetDate = target;
  result.status = "prices-pending"; result.label = "等待完整交易日收盘数据";
  const current = easternParts(now), targetSession = equitySession(target)!;
  if (current.date < target || (current.date === target && current.hour * 60 + current.minute < targetSession.closeMinute + 15)) return result;
  const previous = bars.find(bar => bar.date === baseline)?.close, next = bars.find(bar => bar.date === target)?.close;
  if (previous == null || next == null || !Number.isFinite(previous) || !Number.isFinite(next) || previous <= 0 || next <= 0) return result;
  return { ...result, value: next / previous - 1, status: "available", label: basis === "company-release" ? "发布后首个完整交易日" : "SEC 接收后首个完整交易日" };
}
