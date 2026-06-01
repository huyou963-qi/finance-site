"use client";

import type { MacroDrawingTool } from "@/lib/macroChartDrawing";
import { MACRO_DRAWING_TOOLS } from "@/lib/macroChartDrawing";

export type MacroChartDrawingToolbarProps = {
  tool: MacroDrawingTool;
  onToolChange: (tool: MacroDrawingTool) => void;
  onClear: () => void;
};

export function MacroChartDrawingToolbar({
  tool,
  onToolChange,
  onClear,
}: MacroChartDrawingToolbarProps) {
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-0.5 rounded-md border border-slate-700/90 bg-slate-950/50 p-0.5"
      role="toolbar"
      aria-label="作图工具"
    >
      <span className="shrink-0 px-1.5 text-[10px] font-medium text-slate-500">作图</span>
      {MACRO_DRAWING_TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.title}
          onClick={() => onToolChange(t.id)}
          className={`rounded px-2 py-1 text-[11px] transition ${
            tool === t.id
              ? "bg-emerald-950/55 font-medium text-emerald-100 ring-1 ring-emerald-600/45"
              : "text-slate-300 hover:bg-slate-900/70 hover:text-slate-100"
          }`}
        >
          {t.label}
        </button>
      ))}
      <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-700/90" aria-hidden />
      <button
        type="button"
        onClick={onClear}
        className="rounded px-2 py-1 text-[11px] text-slate-400 transition hover:bg-slate-900/70 hover:text-rose-200"
        title="清除当前所有子图标注"
      >
        清除
      </button>
    </div>
  );
}
