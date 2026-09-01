"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MacroPayload } from "@/lib/data/types";
import { formatMacroDisplayNumber } from "@/lib/formatMacroValue";
import { formatMacroPeriodDisplay } from "@/lib/macroPeriodLabel";

export type MacroExtractedTableColumn = {
  key: string;
  label: string;
};

export type MacroExtractedTableWidths = {
  time: number;
  columns: Map<string, number>;
};

type Props = {
  payload: MacroPayload;
  columns: MacroExtractedTableColumn[];
  valueByKey: Map<string, (number | null)[]>;
  rowIndices: number[];
  widths: MacroExtractedTableWidths;
  timeSort: "asc" | "desc";
  onToggleTimeSort: () => void;
};

const ROW_HEIGHT_PX = 24;
const OVERSCAN_ROWS = 10;

function cellText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return formatMacroDisplayNumber(value);
}

/**
 * 提取结果可能包含数千个时间点。这里只挂载可视区附近的行，避免已选指标
 * 排序等父级状态变化时让浏览器协调整张大表的 DOM。
 */
export const MacroExtractedDataTable = memo(function MacroExtractedDataTable({
  payload,
  columns,
  valueByKey,
  rowIndices,
  widths,
  timeSort,
  onToggleTimeSort,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  const readViewport = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    const next = { scrollTop: element.scrollTop, height: element.clientHeight };
    setViewport((prev) =>
      prev.scrollTop === next.scrollTop && prev.height === next.height ? prev : next,
    );
  }, []);

  const scheduleViewportRead = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      readViewport();
    });
  }, [readViewport]);

  useEffect(() => {
    readViewport();
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(readViewport);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [readViewport]);

  const windowedRows = useMemo(() => {
    const visibleHeight = viewport.height || ROW_HEIGHT_PX * 20;
    const start = Math.max(
      0,
      Math.floor(viewport.scrollTop / ROW_HEIGHT_PX) - OVERSCAN_ROWS,
    );
    const end = Math.min(
      rowIndices.length,
      Math.ceil((viewport.scrollTop + visibleHeight) / ROW_HEIGHT_PX) + OVERSCAN_ROWS,
    );
    return {
      start,
      rows: rowIndices.slice(start, end),
      topHeight: start * ROW_HEIGHT_PX,
      bottomHeight: Math.max(0, (rowIndices.length - end) * ROW_HEIGHT_PX),
    };
  }, [rowIndices, viewport]);

  const columnCount = columns.length + 1;

  return (
    <div ref={viewportRef} className="h-full overflow-auto" onScroll={scheduleViewportRead}>
      <table className="w-max max-w-none table-fixed border-separate border-spacing-0 text-xs">
        <colgroup>
          <col style={{ width: widths.time }} />
          {columns.map((column) => (
            <col
              key={column.key}
              style={{ width: widths.columns.get(column.key) ?? 120 }}
            />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-fs-elevated text-fs-secondary">
          <tr>
            <th
              className="sticky left-0 z-20 border-b border-r border-fs-border bg-fs-elevated px-2 py-1 text-left font-medium"
              style={{ width: widths.time, minWidth: widths.time }}
            >
              <button
                type="button"
                onClick={onToggleTimeSort}
                className="inline-flex items-center gap-1 text-fs-secondary hover:text-fs-accent-text"
                title={
                  timeSort === "asc" ? "按时间升序，点击切换为降序" : "按时间降序，点击切换为升序"
                }
                aria-label={
                  timeSort === "asc" ? "时间升序，点击切换为降序" : "时间降序，点击切换为升序"
                }
              >
                时间
                <span className="text-[10px] text-fs-accent-text" aria-hidden>
                  {timeSort === "asc" ? "↑" : "↓"}
                </span>
              </button>
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                className="whitespace-nowrap border-b border-r border-fs-border bg-fs-elevated px-2 py-1 text-left font-medium"
                style={{ width: widths.columns.get(column.key) }}
                title={column.label}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {windowedRows.topHeight > 0 ? (
            <tr aria-hidden>
              <td colSpan={columnCount} className="border-0 p-0" style={{ height: windowedRows.topHeight }} />
            </tr>
          ) : null}
          {windowedRows.rows.map((dataIndex, visibleIndex) => {
            const absoluteRowIndex = windowedRows.start + visibleIndex;
            const time = payload.categories[dataIndex]!;
            const stickyTimeBg =
              absoluteRowIndex % 2 === 0 ? "bg-fs-bg" : "bg-fs-elevated/35";
            return (
              <tr
                key={`${time}-${dataIndex}`}
                className={`h-6 ${
                  absoluteRowIndex % 2 === 0 ? "bg-fs-bg" : "bg-fs-elevated/35"
                }`}
              >
                <td
                  className={`sticky left-0 z-[5] whitespace-nowrap border-b border-r border-fs-border px-2 py-0.5 text-fs-muted tabular-nums ${stickyTimeBg}`}
                  style={{ minWidth: widths.time }}
                >
                  {formatMacroPeriodDisplay(time, payload.categories)}
                </td>
                {columns.map((column) => (
                  <td
                    key={`${column.key}-${dataIndex}`}
                    className="whitespace-nowrap border-b border-r border-fs-border px-2 py-0.5 text-fs-text tabular-nums"
                  >
                    {cellText(valueByKey.get(column.key)?.[dataIndex])}
                  </td>
                ))}
              </tr>
            );
          })}
          {windowedRows.bottomHeight > 0 ? (
            <tr aria-hidden>
              <td
                colSpan={columnCount}
                className="border-0 p-0"
                style={{ height: windowedRows.bottomHeight }}
              />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
});
