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

/**
 * 资金面只需要目标截面可见的当期和上一期 13F。保留 18 个月缓冲，
 * 避免月度增量任务把全库 13F 历史加载进 Node 堆。
 */
export function fundingHistoryStart(value: string, lookbackMonths = 18): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`非法日期：${value}`);
  }
  // 先归一到月初，避免 31 日跨入短月份时被 Date 自动滚到下个月。
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() - lookbackMonths);
  return parsed.toISOString().slice(0, 10);
}
