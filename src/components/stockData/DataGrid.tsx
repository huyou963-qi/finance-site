"use client";

import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Link } from "@/i18n/navigation";
import { columnHeader, formatCellValue, type SortState } from "@/lib/equity/stockData/display";
import { getIndicator } from "@/lib/equity/stockData/indicatorRegistry";
import {
  COL_WIDTH_DEFAULT,
  clampColWidth,
} from "@/lib/equity/stockData/layoutPrefs";
import type { ColumnSpec, StockDataRow } from "@/lib/equity/stockData/types";
import { INDICATOR_DRAG_TYPE } from "./IndicatorPanel";
import { useTr } from "@/i18n/TextProvider";

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
  /** 首次取数尚未返回时，单元格显示空白而不是状态文字；刷新时保留旧值 */
  loading: boolean;
  /** 是否可链到行情页 / 个股页（经功能权限过滤） */
  linkMarkets?: boolean;
  linkStock?: boolean;
  onCellClick?: (symbol: string, name: string, column: ColumnSpec) => void;
  /** 按 indicatorId 的列宽（px） */
  colWidths?: Readonly<Record<string, number>>;
  onColWidthChange?: (indicatorId: string, widthPx: number) => void;
  /** 电脑版是否冻结序号/代码/简称 */
  freezeIdentity?: boolean;
};

const sortMark = (sort: SortState, key: string) => (sort?.key === key ? (sort.dir === "asc" ? "↑" : "↓") : "↕");

const IDX_W = 32;
const SYM_W = 64;
const NAME_W = 112;

/**
 * 右侧表格：行=股票，列=指标+参数。冻结序号/代码/简称三列（手机只冻结代码），表头三行写指标名、报告期与口径、单位。
 * 点表头选中列（Ctrl/⌘ 多选），双击改参数，点 ↕ 排序；点序号选中行；点格子看时序；拖列头右缘调宽。
 */
export function DataGrid({
  rows, columns, sort, onSort, selectedCols, selectedRows, onSelectCol, onSelectRow, onEditCol, onDropIndicators,
  loading, linkMarkets, linkStock, onCellClick, colWidths, onColWidthChange, freezeIdentity = true,
}: Props) {
  const tr = useTr();
  const [dragOver, setDragOver] = useState(false);
  const resizing = useRef<{ id: string; startX: number; startW: number } | null>(null);
  const th = "border-b border-r border-fs-border bg-fs-elevated px-1.5 py-1 text-left align-top font-normal";
  const td = "border-b border-r border-fs-border px-1.5 py-0.5";

  const widthOf = useCallback(
    (indicatorId: string) => colWidths?.[indicatorId] ?? COL_WIDTH_DEFAULT,
    [colWidths],
  );

  const startResize = (indicatorId: string, e: ReactMouseEvent) => {
    if (!onColWidthChange) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(indicatorId);
    resizing.current = { id: indicatorId, startX, startW };
    const onMove = (ev: MouseEvent) => {
      const cur = resizing.current;
      if (!cur) return;
      onColWidthChange(cur.id, clampColWidth(cur.startW + (ev.clientX - cur.startX)));
    };
    const onUp = () => {
      resizing.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const freezeMd = freezeIdentity;

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
            <th
              className={`${th} z-30 text-center ${freezeMd ? "max-md:static md:sticky md:left-0" : ""}`}
              style={{ width: IDX_W, minWidth: IDX_W, maxWidth: IDX_W }}
            >{tr("序号")}</th>
            <th
              className={`${th} z-30 ${freezeMd ? "sticky left-0 md:left-8" : "sticky left-0 md:static"}`}
              style={{ width: SYM_W, minWidth: SYM_W, maxWidth: SYM_W }}
            >
              <button type="button" onClick={() => onSort("$symbol")} className="flex items-center gap-1">{tr("代码")} <span className="text-xs text-fs-muted">{sortMark(sort, "$symbol")}</span></button>
            </th>
            <th
              className={`${th} z-30 ${freezeMd ? "max-md:static md:sticky md:left-24" : ""}`}
              style={{ minWidth: NAME_W, maxWidth: 160 }}
            >
              <button type="button" onClick={() => onSort("$name")} className="flex items-center gap-1">{tr("简称")} <span className="text-xs text-fs-muted">{sortMark(sort, "$name")}</span></button>
            </th>
            {columns.map((c) => {
              const h = columnHeader(c);
              const active = selectedCols.has(c.key);
              const def = getIndicator(c.indicatorId);
              const w = widthOf(c.indicatorId);
              return (
                <th
                  key={c.key}
                  className={`${th} relative ${active ? "!bg-fs-accent-soft" : ""}`}
                  style={{ width: w, minWidth: w, maxWidth: w }}
                  aria-selected={active}
                >
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
                    <button type="button" aria-label={tr("按 {label} 排序", { label: h.label })} onClick={() => onSort(c.key)} className="shrink-0 px-1 text-xs text-fs-muted hover:text-fs-text">
                      {sortMark(sort, c.key)}
                    </button>
                  </div>
                  {onColWidthChange ? (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={tr("拖动调整列宽")}
                      onMouseDown={(e) => startResize(c.indicatorId, e)}
                      className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize hover:bg-fs-accent/40"
                    />
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const rowActive = selectedRows.has(r.symbol);
            const bg = rowActive ? "bg-fs-accent-soft" : "bg-fs-bg";
            const stockHref = `/equity/stocks/${encodeURIComponent(r.symbol)}`;
            const marketsHref = `/markets?symbol=${encodeURIComponent(r.symbol)}`;
            return (
              <tr key={r.symbol}>
                <td
                  className={`${td} ${bg} z-10 text-center text-fs-muted ${freezeMd ? "max-md:static md:sticky md:left-0" : ""}`}
                  style={{ width: IDX_W, minWidth: IDX_W, maxWidth: IDX_W }}
                >
                  <button type="button" onClick={(e) => onSelectRow(r.symbol, e.ctrlKey || e.metaKey || e.shiftKey)} aria-pressed={rowActive} aria-label={tr("选中 {symbol}", { symbol: r.symbol })} className="w-full">
                    {i + 1}
                  </button>
                </td>
                <td
                  className={`${td} ${bg} z-10 truncate font-medium ${freezeMd ? "sticky left-0 md:left-8" : "sticky left-0 md:static"}`}
                  style={{ width: SYM_W, minWidth: SYM_W, maxWidth: SYM_W }}
                >
                  {linkMarkets ? (
                    <Link href={marketsHref} className="text-fs-accent hover:underline" title={tr("打开行情")}>
                      {r.symbol}
                    </Link>
                  ) : linkStock ? (
                    <Link href={stockHref} className="text-fs-accent hover:underline" title={tr("打开个股")}>
                      {r.symbol}
                    </Link>
                  ) : r.symbol}
                </td>
                <td
                  className={`${td} ${bg} z-10 truncate ${freezeMd ? "max-md:static md:sticky md:left-24" : ""}`}
                  style={{ minWidth: NAME_W, maxWidth: 160 }}
                  title={r.name}
                >
                  {linkStock ? (
                    <Link href={stockHref} className="hover:underline" title={tr("打开个股")}>
                      {r.name}
                    </Link>
                  ) : r.name}
                </td>
                {columns.map((c) => {
                  const unit = getIndicator(c.indicatorId)?.unit ?? "text";
                  const cell = r.cells[c.key];
                  const { text, muted } = loading && !cell ? { text: "", muted: true } : formatCellValue(unit, cell, c.params.scale);
                  const numeric = cell?.s === "ok" && typeof cell.v === "number";
                  const tipParts = [
                    cell?.p ? `${cell.p}${cell.d ? tr("（截至 {d}）", { d: cell.d }) : ""}` : "",
                    onCellClick ? tr("点击查看时序") : "",
                  ].filter(Boolean);
                  const w = widthOf(c.indicatorId);
                  return (
                    <td
                      key={c.key}
                      title={tipParts.join(" · ") || undefined}
                      style={{ width: w, minWidth: w, maxWidth: w }}
                      className={`${td} truncate ${selectedCols.has(c.key) ? "bg-fs-accent-soft/50" : rowActive ? "bg-fs-accent-soft" : ""} ${numeric ? "text-right tabular-nums" : ""} ${muted ? "text-fs-muted" : ""} ${onCellClick ? "cursor-pointer hover:bg-fs-elevated" : ""}`}
                      onClick={() => onCellClick?.(r.symbol, r.name, c)}
                    >
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
