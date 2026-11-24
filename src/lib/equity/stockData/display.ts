/** 「股票数据」表格的显示、排序与 CSV 导出（纯函数，浏览器使用） */

import {
  formatCompactMoney,
  formatEps,
  formatMultiplier,
  formatPct,
} from "@/lib/equity/formatFundamentalsDisplay";
import { identityTr, type Tr } from "@/i18n/text";
import { columnParamLabel, getIndicator, UNIT_LABELS } from "./indicatorRegistry";
import { CELL_STATUS_LABELS, type Cell, type ColumnSpec, type IndicatorUnit, type Scale, type StockDataRow } from "./types";

const SCALE_DIVISOR: Record<Exclude<Scale, "auto">, number> = { raw: 1, k: 1e3, m: 1e6, b: 1e9 };
const SCALE_PREFIX: Record<Exclude<Scale, "auto">, string> = { raw: "", k: "千", m: "百万", b: "十亿" };

export function formatCellValue(
  unit: IndicatorUnit,
  cell: Cell | undefined,
  scale?: Scale,
  tr: Tr = identityTr,
): { text: string; muted: boolean } {
  if (!cell) return { text: "", muted: true };
  if (cell.s !== "ok") return { text: tr(CELL_STATUS_LABELS[cell.s]), muted: true };
  const v = cell.v;
  if (typeof v === "string") return { text: tr(v), muted: false };
  if (v == null) return { text: "—", muted: true };
  if ((unit === "money" || unit === "shares") && scale && scale !== "auto") {
    const x = v / SCALE_DIVISOR[scale];
    return { text: x.toLocaleString("en-US", { maximumFractionDigits: scale === "raw" ? 0 : 2 }), muted: false };
  }
  switch (unit) {
    case "money":
    case "shares": return { text: formatCompactMoney(v), muted: false };
    case "pct": return { text: formatPct(v, 2), muted: false };
    case "perShare": return { text: formatEps(v), muted: false };
    case "multiple": return { text: formatMultiplier(v, 2), muted: false };
    case "number": return { text: v.toLocaleString("en-US", { maximumFractionDigits: 2 }), muted: false };
    default: return { text: String(v), muted: false };
  }
}

export function columnHeader(col: ColumnSpec, tr: Tr = identityTr): { label: string; params: string; unit: string } {
  const def = getIndicator(col.indicatorId);
  const scale = col.params.scale;
  const prefix = scale && scale !== "auto" ? SCALE_PREFIX[scale] : "";
  const unitBase = def ? UNIT_LABELS[def.unit] : "";
  const unitRaw = def ? `${prefix}${unitBase}` : "";
  return {
    label: tr(def?.label ?? col.indicatorId),
    params: columnParamLabel(col.params, tr),
    unit: unitRaw ? tr(unitRaw) : "",
  };
}

/**
 * 导出用的原始值（不缩写）：金额按列的显示单位折算；百分比在 CSV 里写成百分数，
 * 在 XLSX 里保留小数并由单元格格式显示为百分比；没有值的格子写状态文字。
 */
export function exportValue(col: ColumnSpec, cell: Cell | undefined, pctAsPercent: boolean): string | number {
  if (!cell) return "";
  if (cell.s !== "ok") return CELL_STATUS_LABELS[cell.s];
  if (typeof cell.v !== "number") return cell.v ?? "";
  const unit = getIndicator(col.indicatorId)?.unit;
  if (unit === "pct") return pctAsPercent ? Number((cell.v * 100).toPrecision(12)) : cell.v;
  const scale = col.params.scale;
  if ((unit === "money" || unit === "shares") && scale && scale !== "auto") return Number((cell.v / SCALE_DIVISOR[scale]).toPrecision(12));
  return cell.v;
}

/** 列头一行文字：指标名 [参数] (单位) */
export function columnHeaderText(col: ColumnSpec, tr: Tr = identityTr): string {
  const h = columnHeader(col, tr);
  return [h.label, h.params && `[${h.params}]`, h.unit && `(${h.unit})`].filter(Boolean).join(" ");
}

/**
 * 导出脚注（业务语言）：报告期 / 修订口径 / 复权说明；不写数据商、表名或管线。
 * 供 CSV / XLSX 共用。
 */
export function exportFootnoteLines(columns: readonly ColumnSpec[]): string[] {
  const lines = [
    "说明：财务类取上市公司公开定期报告的最新修订值；报告期按公司财年。",
    "估值类只用截止日之前已披露的财报。表内金额为原始数值（未做市值缩写）；百分比在 CSV 中为百分数。",
  ];
  const adjusts = [...new Set(columns.map((c) => c.params.adjust).filter(Boolean))];
  if (adjusts.length) {
    const labels = adjusts.map((a) => (a === "forward" ? "前复权" : a === "none" ? "不复权" : String(a)));
    lines.push(`行情与部分技术指标价格口径：${labels.join("、")}（见各列参数）。`);
  }
  const periods = [
    ...new Set(
      columns
        .map((c) => columnParamLabel(c.params))
        .filter(Boolean),
    ),
  ].slice(0, 8);
  if (periods.length) lines.push(`本表列参数摘录：${periods.join("；")}${periods.length >= 8 ? "…" : ""}`);
  return lines;
}

function appendFootnotes(aoa: (string | number)[][], columns: readonly ColumnSpec[]): void {
  aoa.push([]);
  for (const line of exportFootnoteLines(columns)) aoa.push([line]);
}

/** XLSX 用的二维数组：第一行列头，之后每只股票一行；末尾脚注；pctColumns 是需要设百分比格式的列下标 */
export function buildSheetData(rows: readonly StockDataRow[], columns: readonly ColumnSpec[]): { aoa: (string | number)[][]; pctColumns: number[] } {
  const aoa: (string | number)[][] = [["代码", "名称", ...columns.map((c) => columnHeaderText(c))]];
  for (const r of rows) aoa.push([r.symbol, r.name, ...columns.map((c) => exportValue(c, r.cells[c.key], false))]);
  appendFootnotes(aoa, columns);
  const pctColumns = columns.flatMap((c, i) => (getIndicator(c.indicatorId)?.unit === "pct" ? [i + 2] : []));
  return { aoa, pctColumns };
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

/** 导出原始数值（不缩写）；百分比导出为百分数，没有值的格子写状态文字；末尾附参数脚注 */
export function buildCsv(rows: readonly StockDataRow[], columns: readonly ColumnSpec[]): string {
  const header = ["代码", "名称", ...columns.map((c) => columnHeaderText(c))];
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    const cells = columns.map((c) => exportValue(c, r.cells[c.key], true));
    lines.push([r.symbol, r.name, ...cells].map((s) => csvEscape(String(s))).join(","));
  }
  lines.push("");
  for (const note of exportFootnoteLines(columns)) lines.push(csvEscape(note));
  // BOM 让 Excel 按 UTF-8 打开中文
  return `﻿${lines.join("\r\n")}\r\n`;
}
