/** Asia/Shanghai 日历日工具（埋点日界与日聚合共用）。 */

const SHANGHAI_OFFSET = "+08:00";

/** 返回 YYYY-MM-DD（上海时区）。 */
export function shanghaiDateString(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** 上海日历日 → [start, end) UTC Date。 */
export function shanghaiDayBounds(dateStr: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`非法日期: ${dateStr}`);
  }
  const start = new Date(`${dateStr}T00:00:00${SHANGHAI_OFFSET}`);
  const end = new Date(`${dateStr}T24:00:00${SHANGHAI_OFFSET}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`非法日期: ${dateStr}`);
  }
  return { start, end };
}

/** 上海日历日加减天数，仍返回 YYYY-MM-DD。 */
export function addShanghaiDays(dateStr: string, days: number): string {
  const { start } = shanghaiDayBounds(dateStr);
  const next = new Date(start.getTime() + days * 86_400_000);
  return shanghaiDateString(next);
}

export function dateOnlyUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}
