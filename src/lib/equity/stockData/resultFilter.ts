/**
 * 「股票数据」结果表条件过滤（纯函数，浏览器用）：只过滤当前已取回的行，不做选股引擎。
 */

import type { Cell, StockDataRow } from "./types";

export type FilterOp = "gt" | "gte" | "lt" | "lte" | "eq" | "ne" | "contains";

export type ResultFilter = {
  /** 列 key，或 $symbol / $name */
  columnKey: string;
  op: FilterOp;
  /** 数值比较时解析为 number；contains 用字符串 */
  value: string;
};

export const FILTER_OP_LABELS: Record<FilterOp, string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  eq: "=",
  ne: "≠",
  contains: "包含",
};

function cellOf(row: StockDataRow, key: string): Cell | { v: string; s: "ok" } | null {
  if (key === "$symbol") return { v: row.symbol, s: "ok" };
  if (key === "$name") return { v: row.name, s: "ok" };
  return row.cells[key] ?? null;
}

function matches(cell: Cell | { v: string | number | null; s: string } | null, op: FilterOp, raw: string): boolean {
  if (!cell || cell.s !== "ok" || cell.v == null) return false;
  if (op === "contains") {
    return String(cell.v).toLowerCase().includes(raw.trim().toLowerCase());
  }
  const target = Number(raw);
  if (!Number.isFinite(target) || typeof cell.v !== "number") return false;
  switch (op) {
    case "gt": return cell.v > target;
    case "gte": return cell.v >= target;
    case "lt": return cell.v < target;
    case "lte": return cell.v <= target;
    case "eq": return cell.v === target;
    case "ne": return cell.v !== target;
  }
}

/** 多条件 AND */
export function applyResultFilters(rows: readonly StockDataRow[], filters: readonly ResultFilter[]): StockDataRow[] {
  if (!filters.length) return [...rows];
  return rows.filter((row) => filters.every((f) => matches(cellOf(row, f.columnKey), f.op, f.value)));
}
