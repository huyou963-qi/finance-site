"use client";

import { useState } from "react";
import { columnHeader, formatCellValue, type SortState } from "@/lib/equity/stockData/display";
import { getIndicator } from "@/lib/equity/stockData/indicatorRegistry";
import type { ColumnSpec, StockDataRow } from "@/lib/equity/stockData/types";
import { INDICATOR_DRAG_TYPE } from "./IndicatorPanel";

type Props = {
  rows: StockDataRow[];
  columns: ColumnSpec[];
  sort: SortState;
  onSort: (key: string) => void;
  selectedCols: ReadonlySet<string>;
  selectedRows: ReadonlySet<string>;
  onSelectCol: (key: string, multi: boolean) => void;
  onSelectRow: (symbol: string, multi: boolean) => void;
  onEditCol: (key: string) => void;
  onDropIndicators: (ids: string[]) => void;
  /** 结果尚未取回时，单元格显示空白而不是状态文字 */
  loading: boolean;
};

const sortMark = (sort: SortState, key: string) => (sort?.key === key ? (sort.dir === "asc" ? "↑" : "↓") : "↕");

/**
 * 右侧表格：行=股票，列=指标+参数。冻结序号/代码/简称三列（手机只冻结代码），表头三行写指标名、报告期与口径、单位。
 * 点表头选中列（Ctrl/⌘ 多选），双击改参数，点 ↕ 排序；点序号选中行。
 */
export function DataGrid({ rows, columns, sort, onSort, selectedCols, selectedRows, onSelectCol, onSelectRow, onEditCol, onDropIndicators, loading }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const th = "border-b border-r border-fs-border bg-fs-elevated px-1.5 py-1 text-left align-top font-normal";
  const td = "border-b border-r border-fs-border px-1.5 py-0.5";

  return (
    <div
      className={`relative min-h-0 flex-1 overflow-auto ${dragOver ? "outline outline-2 -outline-offset-2 outline-fs-accent" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(INDICATOR_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const raw = e.dataTransfer.getData(INDICATOR_DRAG_TYPE);
        if (!raw) return;
        e.preventDefault();
        try { onDropIndicators(JSON.parse(raw)); } catch { /* 非本页拖入的数据 */ }
      }}
    >
      <table className="border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-20">
          <tr>
            <th className={`${th} left-0 z-30 w-8 min-w-8 max-w-8 text-center max-md:static md:sticky`}>序号</th>
            <th className={`${th} sticky left-0 z-30 w-16 min-w-16 max-w-16 md:left-8`}>
              <button type="button" onClick={() => onSort("$symbol")} className="flex items-center gap-1">代码 <span className="text-xs text-fs-muted">{sortMark(sort, "$symbol")}</span></button>
            </th>
            <th className={`${th} z-30 min-w-28 max-md:static md:sticky md:left-24`}>
              <button type="button" onClick={() => onSort("$name")} className="flex items-center gap-1">简称 <span className="text-xs text-fs-muted">{sortMark(sort, "$name")}</span></button>
            </th>
            {columns.map((c) => {
              const h = columnHeader(c);
              const active = selectedCols.has(c.key);
              const def = getIndicator(c.indicatorId);
              return (
                <th key={c.key} className={`${th} min-w-24 max-w-44 ${active ? "!bg-fs-accent-soft" : ""}`} aria-selected={active}>
                  <div className="flex items-start gap-1">
                    <button
                      type="button"
                      onClick={(e) => onSelectCol(c.key, e.ctrlKey || e.metaKey || e.shiftKey)}
                      onDoubleClick={() => def?.params.length && onEditCol(c.key)}
                      title={def?.note ? `${h.label}：${def.note}` : h.label}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block font-semibold leading-tight">{h.label}</span>
                      {h.params ? <span className="block text-[11px] leading-tight text-fs-muted">{h.params}</span> : null}
                      {h.unit ? <span className="block text-[11px] leading-tight text-fs-muted">{h.unit}</span> : null}
                    </button>
                    <button type="button" aria-label={`按 ${h.label} 排序`} onClick={() => onSort(c.key)} className="shrink-0 px-1 text-xs text-fs-muted hover:text-fs-text">
                      {sortMark(sort, c.key)}
                    </button>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const rowActive = selectedRows.has(r.symbol);
            const bg = rowActive ? "bg-fs-accent-soft" : "bg-fs-bg";
            return (
              <tr key={r.symbol}>
                <td className={`${td} ${bg} left-0 z-10 w-8 min-w-8 max-w-8 text-center text-fs-muted max-md:static md:sticky`}>
                  <button type="button" onClick={(e) => onSelectRow(r.symbol, e.ctrlKey || e.metaKey || e.shiftKey)} aria-pressed={rowActive} aria-label={`选中 ${r.symbol}`} className="w-full">
                    {i + 1}
                  </button>
                </td>
                <td className={`${td} ${bg} sticky left-0 z-10 w-16 min-w-16 max-w-16 truncate font-medium md:left-8`}>{r.symbol}</td>
                <td className={`${td} ${bg} z-10 max-w-40 truncate max-md:static md:sticky md:left-24`} title={r.name}>{r.name}</td>
                {columns.map((c) => {
                  const unit = getIndicator(c.indicatorId)?.unit ?? "text";
                  const cell = r.cells[c.key];
                  const { text, muted } = loading && !cell ? { text: "", muted: true } : formatCellValue(unit, cell, c.params.scale);
                  const numeric = cell?.s === "ok" && typeof cell.v === "number";
                  const title = cell?.p ? `${cell.p}${cell.d ? `（截至 ${cell.d}）` : ""}` : undefined;
                  return (
                    <td key={c.key} title={title} className={`${td} max-w-44 truncate ${selectedCols.has(c.key) ? "bg-fs-accent-soft/50" : rowActive ? "bg-fs-accent-soft" : ""} ${numeric ? "text-right tabular-nums" : ""} ${muted ? "text-fs-muted" : ""}`}>
                      {text}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
