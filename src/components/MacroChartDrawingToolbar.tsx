"use client";

import type { MacroDrawing, MacroDrawingStyle, MacroDrawingTool } from "@/lib/macroChartDrawing";
import {
  DEFAULT_MACRO_DRAWING_STYLE,
  MACRO_DRAWING_TOOLS,
  resolveDrawingStyle,
} from "@/lib/macroChartDrawing";

export type MacroChartDrawingToolbarProps = {
  tool: MacroDrawingTool;
  onToolChange: (tool: MacroDrawingTool) => void;
  onClear: () => void;
  drawStyle: MacroDrawingStyle;
  onDrawStyleChange: (patch: Partial<MacroDrawingStyle>) => void;
  selectedDrawing: MacroDrawing | null;
  onSelectedStyleChange: (patch: Partial<MacroDrawingStyle>) => void;
  onSelectedTextChange: (text: string) => void;
  onDeleteSelected: () => void;
};

const LINE_STYLES: Array<{ value: MacroDrawingStyle["lineStyle"]; label: string }> = [
  { value: "solid", label: "实线" },
  { value: "dashed", label: "虚线" },
  { value: "dotted", label: "点线" },
];

export function MacroChartDrawingToolbar({
  tool,
  onToolChange,
  onClear,
  drawStyle,
  onDrawStyleChange,
  selectedDrawing,
  onSelectedStyleChange,
  onSelectedTextChange,
  onDeleteSelected,
}: MacroChartDrawingToolbarProps) {
  const activeStyle = selectedDrawing
    ? resolveDrawingStyle(selectedDrawing.style)
    : drawStyle;
  const styleTarget = selectedDrawing ? onSelectedStyleChange : onDrawStyleChange;
  const isText = selectedDrawing?.kind === "text";
  const showLineControls = !isText;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      <div
        className="flex flex-wrap items-center gap-0.5 rounded-md border border-fs-border/90 bg-fs-elevated p-0.5"
        role="toolbar"
        aria-label="作图工具"
      >
        <span className="shrink-0 px-1.5 text-[10px] font-medium text-fs-muted">作图</span>
        {MACRO_DRAWING_TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.title}
            onClick={() => onToolChange(t.id)}
            className={`rounded px-2 py-1 text-[11px] transition ${
              tool === t.id
                ? "bg-fs-accent-soft font-medium text-fs-accent-text ring-1 ring-fs-accent/30"
                : "text-fs-secondary hover:bg-fs-elevated hover:text-fs-text"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-fs-border/90" aria-hidden />
        <button
          type="button"
          onClick={onClear}
          className="rounded px-2 py-1 text-[11px] text-fs-muted transition hover:bg-fs-elevated hover:text-rose-200"
          title="清除当前所有子图标注"
        >
          清除
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-md border border-fs-border/90 bg-fs-elevated px-1.5 py-0.5">
        <span className="text-[10px] text-fs-muted">
          {selectedDrawing ? "选中样式" : "默认样式"}
        </span>
        {showLineControls ? (
          <>
            <label className="flex items-center gap-0.5 text-[10px] text-fs-muted" title="线条颜色">
              线色
              <input
                type="color"
                value={activeStyle.color}
                onChange={(e) => styleTarget({ color: e.target.value })}
                className="h-5 w-6 cursor-pointer rounded border border-fs-border bg-fs-elevated p-0"
              />
            </label>
            <label className="flex items-center gap-0.5 text-[10px] text-fs-muted">
              粗细
              <input
                type="number"
                min={0.5}
                max={6}
                step={0.5}
                value={activeStyle.lineWidth}
                onChange={(e) =>
                  styleTarget({
                    lineWidth: Math.max(0.5, Math.min(6, Number.parseFloat(e.target.value) || 1.5)),
                  })
                }
                className="w-10 rounded border border-fs-border bg-fs-elevated px-0.5 text-center text-[10px] text-fs-text"
              />
            </label>
            <select
              value={activeStyle.lineStyle}
              onChange={(e) =>
                styleTarget({ lineStyle: e.target.value as MacroDrawingStyle["lineStyle"] })
              }
              className="rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
              title="线条风格"
            >
              {LINE_STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {isText || tool === "text" ? (
          <>
            <label className="flex items-center gap-0.5 text-[10px] text-fs-muted">
              字色
              <input
                type="color"
                value={activeStyle.textColor}
                onChange={(e) => styleTarget({ textColor: e.target.value })}
                className="h-5 w-6 cursor-pointer rounded border border-fs-border bg-fs-elevated p-0"
              />
            </label>
            <label className="flex items-center gap-0.5 text-[10px] text-fs-muted">
              字号
              <input
                type="number"
                min={8}
                max={24}
                value={activeStyle.fontSize}
                onChange={(e) =>
                  styleTarget({
                    fontSize: Math.max(8, Math.min(24, Number.parseInt(e.target.value, 10) || 11)),
                  })
                }
                className="w-10 rounded border border-fs-border bg-fs-elevated px-0.5 text-center text-[10px] text-fs-text"
              />
            </label>
          </>
        ) : null}
        {!selectedDrawing && !showLineControls && tool !== "text" ? (
          <span className="text-[10px] text-fs-secondary">选中文本或切到文本工具</span>
        ) : null}
      </div>

      {selectedDrawing ? (
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-sky-800/60 bg-sky-950/25 px-1.5 py-0.5">
          <span className="text-[10px] text-sky-200/90">已选中</span>
          {selectedDrawing.kind === "text" ? (
            <input
              type="text"
              value={selectedDrawing.text}
              onChange={(e) => onSelectedTextChange(e.target.value)}
              className="min-w-[6rem] max-w-[12rem] rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[10px] text-fs-text"
            />
          ) : (
            <span className="text-[10px] text-fs-muted">
              {selectedDrawing.kind === "hline"
                ? "水平线"
                : selectedDrawing.kind === "vline"
                  ? "垂直线"
                  : selectedDrawing.kind === "trend"
                    ? "趋势线"
                    : "矩形"}
            </span>
          )}
          <button
            type="button"
            onClick={onDeleteSelected}
            className="rounded border border-rose-900/60 px-1.5 py-0.5 text-[10px] text-rose-300 hover:bg-rose-950/40"
            title="Delete 删除"
          >
            删除
          </button>
          <span className="text-[10px] text-fs-secondary">Del</span>
        </div>
      ) : (
        <span className="text-[10px] text-fs-secondary">十字模式下点击可选中并拖动</span>
      )}
    </div>
  );
}

export { DEFAULT_MACRO_DRAWING_STYLE };
