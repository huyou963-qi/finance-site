/**
 * 按 GICS 一级行业对当前结果表做分组统计（纯函数）：中位数与均值。
 */

import type { StockDataRow } from "./types";

export type GroupStat = {
  group: string;
  count: number;
  mean: number | null;
  median: number | null;
};

function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * @param rows 当前表格行（可已过滤）
 * @param groupColumnKey 分组列（通常是 GICS 一级行业列的 key）
 * @param valueColumnKey 数值列 key
 */
export function computeGroupStats(
  rows: readonly StockDataRow[],
  groupColumnKey: string,
  valueColumnKey: string,
): GroupStat[] {
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const gCell = row.cells[groupColumnKey];
    const vCell = row.cells[valueColumnKey];
    if (!gCell || gCell.s !== "ok" || gCell.v == null) continue;
    if (!vCell || vCell.s !== "ok" || typeof vCell.v !== "number") continue;
    const g = String(gCell.v);
    const list = buckets.get(g) ?? [];
    list.push(vCell.v);
    buckets.set(g, list);
  }
  return [...buckets.entries()]
    .map(([group, vals]) => ({
      group,
      count: vals.length,
      mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      median: medianOf(vals),
    }))
    .sort((a, b) => a.group.localeCompare(b.group, "zh"));
}
