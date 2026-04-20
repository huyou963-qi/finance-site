/** `YYYY-MM` 字符串工具（用于月度宏观横轴） */

export function addOneMonth(ym: string): string {
  const y = Number.parseInt(ym.slice(0, 4), 10);
  const m = Number.parseInt(ym.slice(5, 7), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error(`无效的 YYYY-MM：${ym}`);
  }
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** 含首尾；假定 start、end 均为零填充的 `YYYY-MM` 且 start <= end */
export function enumerateMonthsInclusive(start: string, end: string): string[] {
  if (start > end) return [];
  const out: string[] = [];
  let cur = start;
  while (true) {
    out.push(cur);
    if (cur >= end) break;
    cur = addOneMonth(cur);
  }
  return out;
}
