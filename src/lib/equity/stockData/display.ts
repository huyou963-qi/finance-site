/** 「股票数据」表格的显示、排序与 CSV 导出（纯函数，浏览器使用） */

import {
  formatCompactMoney,
  formatEps,
  formatMultiplier,
  formatPct,
} from "@/lib/equity/formatFundamentalsDisplay";
import { columnParamLabel, getIndicator, UNIT_LABELS } from "./indicatorRegistry";
import { CELL_STATUS_LABELS, type Cell, type ColumnSpec, type IndicatorUnit, type StockDataRow } from "./types";

export function formatCellValue(unit: IndicatorUnit, cell: Cell | undefined): { text: string; muted: boolean } {
  if (!cell) return { text: "", muted: true };
  if (cell.s !== "ok") return { text: CELL_STATUS_LABELS[cell.s], muted: true };
  const v = cell.v;
  if (typeof v === "string") return { text: v, muted: false };
  if (v == null) return { text: "—", muted: true };
  switch (unit) {
    case "money":
    case "shares": return { text: formatCompactMoney(v), muted: false };
    case "pct": return { text: formatPct(v, 2), muted: false };
    case "perShare": return { text: formatEps(v), muted: false };
    case "multiple": return { text: formatMultiplier(v, 2), muted: false };
    default: return { text: String(v), muted: false };
  }
}

export function columnHeader(col: ColumnSpec): { label: string; params: string; unit: string } {
  const def = getIndicator(col.indicatorId);
  return {
    label: def?.label ?? col.indicatorId,
    params: columnParamLabel(col.params),
    unit: def ? UNIT_LABELS[def.unit] : "",
  };
}

export type SortState = { key: string; dir: "asc" | "desc" } | null;

/** 排序：数值按大小，文字按拼写；没有值的格子始终排在最后 */
export function sortRows(rows: readonly StockDataRow[], sort: SortState): StockDataRow[] {
  if (!sort) return [...rows];
  const sign = sort.dir === "asc" ? 1 : -1;
  const valueOf = (r: StockDataRow): number | string | null => {
    if (sort.key === "$symbol") return r.symbol;
    if (sort.key === "$name") return r.name;
    const c = r.cells[sort.key];
    return c && c.s === "ok" ? c.v : null;
  };
  return [...rows].sort((a, b) => {
    const x = valueOf(a);
    const y = valueOf(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return String(x).localeCompare(String(y), "zh-CN") * sign;
  });
}

function csvEscape(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 导出原始数值（不缩写）；百分比导出为百分数，没有值的格子写状态文字 */
export function buildCsv(rows: readonly StockDataRow[], columns: readonly ColumnSpec[]): string {
  const header = ["代码", "名称", ...columns.map((c) => {
    const h = columnHeader(c);
    return [h.label, h.params && `[${h.params}]`, h.unit && `(${h.unit})`].filter(Boolean).join(" ");
  })];
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    const cells = columns.map((c) => {
      const cell = r.cells[c.key];
      if (!cell) return "";
      if (cell.s !== "ok") return CELL_STATUS_LABELS[cell.s];
      if (typeof cell.v === "number") {
        const unit = getIndicator(c.indicatorId)?.unit;
        return String(unit === "pct" ? Number((cell.v * 100).toPrecision(12)) : cell.v);
      }
      return cell.v ?? "";
    });
    lines.push([r.symbol, r.name, ...cells].map((s) => csvEscape(String(s))).join(","));
  }
  // BOM 让 Excel 按 UTF-8 打开中文
  return `﻿${lines.join("\r\n")}\r\n`;
}
