/** 上一个已经完整结束的自然月月末（UTC，YYYY-MM-DD）。 */
export function previousCompletedMonthEnd(now: Date): string {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return end.toISOString().slice(0, 10);
}

export function isCalendarMonthEnd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const next = new Date(parsed.getTime() + 86_400_000);
  return next.getUTCMonth() !== parsed.getUTCMonth();
}

export function monthKey(value: string): string {
  if (!isCalendarMonthEnd(value)) throw new Error(`目标日期必须是自然月末：${value}`);
  return value.slice(0, 7);
}
