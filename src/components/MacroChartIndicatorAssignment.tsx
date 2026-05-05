"use client";

import { useState, type DragEvent } from "react";
import { unifiedSeriesDisplayName } from "@/lib/data/macroCatalog";
import type { MacroSlotAssignment } from "@/lib/macroPartition";
import type {
  MacroSeriesAxis,
  MacroSeriesChartType,
  MacroSeriesVisualConfigMap,
} from "@/lib/macroChartOption";

const DRAG_TYPE = "application/x-finance-macro-key";

export type MacroChartIndicatorAssignmentProps = {
  layoutMode: 1 | 2 | 3 | 4;
  selectedKeys: Set<string>;
  slotAssignment: MacroSlotAssignment;
  onAssign: (key: string, slot: number | null) => void;
  seriesVisualMap: MacroSeriesVisualConfigMap;
  onUpdateSeriesVisual: (
    key: string,
    patch: { axis?: MacroSeriesAxis; chartType?: MacroSeriesChartType },
  ) => void;
};

const CHART_TYPES: Array<{ value: MacroSeriesChartType; label: string }> = [
  { value: "line", label: "折线" },
  { value: "dashedLine", label: "虚线" },
  { value: "area", label: "面积" },
  { value: "stackArea", label: "堆叠面积" },
  { value: "stepLine", label: "阶梯线" },
  { value: "bar", label: "柱状" },
  { value: "stackBar", label: "堆叠柱状" },
  { value: "scatter", label: "散点" },
];

/** 图形属性 · 指标选择：按图槽位与「待选集」拖拽分配 */
export function MacroChartIndicatorAssignment({
  layoutMode,
  selectedKeys,
  slotAssignment,
  onAssign,
  seriesVisualMap,
  onUpdateSeriesVisual,
}: MacroChartIndicatorAssignmentProps) {
  const [dragOver, setDragOver] = useState<{ kind: "slot"; slot: number } | { kind: "pool" } | null>(
    null,
  );

  const keysList = [...selectedKeys].sort((a, b) => a.localeCompare(b));

  function resolvedSlot(key: string): number | null {
    const cap = Math.max(0, layoutMode - 1);
    const raw = slotAssignment[key];
    if (raw === null) return null;
    if (raw === undefined || Number.isNaN(raw)) return 0;
    return Math.min(cap, Math.max(0, Math.floor(raw)));
  }

  const bySlot: string[][] = Array.from({ length: layoutMode }, () => []);
  const pool: string[] = [];

  for (const key of keysList) {
    const r = resolvedSlot(key);
    if (r === null) {
      pool.push(key);
    } else {
      bySlot[r]?.push(key);
    }
  }

  function startDrag(key: string) {
    return (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, key);
      e.dataTransfer.effectAllowed = "move";
    };
  }

  function dragProps(
    dropTarget: { kind: "slot"; slot: number } | { kind: "pool" },
  ) {
    return {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(dropTarget);
      },
      onDragLeave: () => setDragOver(null),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDragOver(null);
        const key = e.dataTransfer.getData(DRAG_TYPE);
        if (!key || !selectedKeys.has(key)) return;
        if (dropTarget.kind === "slot") {
          onAssign(key, dropTarget.slot);
        } else {
          onAssign(key, null);
        }
      },
    };
  }

  function dropActive(
    target: { kind: "slot"; slot: number } | { kind: "pool" },
  ): boolean {
    if (!dragOver) return false;
    if (target.kind === "pool") return dragOver.kind === "pool";
    return dragOver.kind === "slot" && dragOver.slot === target.slot;
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          指标选择
        </h4>
        <p className="text-[11px] leading-relaxed text-slate-500">
          单图时为「图 1」与「待选集」；多图为各子图与「待选集」。拖到图上即绘制在该图；拖到待选集则不绘制（仍参与数据请求）。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: layoutMode }, (_, slot) => (
          <div
            key={slot}
            {...dragProps({ kind: "slot", slot })}
            className={`rounded-lg border px-2 py-2 transition-colors ${
              dropActive({ kind: "slot", slot })
                ? "border-emerald-500 bg-emerald-950/30"
                : "border-slate-800 bg-slate-900/40"
            }`}
          >
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-medium text-slate-400">图 {slot + 1}</div>
              {bySlot[slot].length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      bySlot[slot].forEach((k) =>
                        onUpdateSeriesVisual(k, { axis: "right" }),
                      );
                    }}
                    className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-slate-500 hover:text-slate-100"
                  >
                    一键右轴
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      bySlot[slot].forEach((k) =>
                        onUpdateSeriesVisual(k, { axis: "left" }),
                      );
                    }}
                    className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-slate-500 hover:text-slate-100"
                  >
                    一键左轴
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      bySlot[slot].forEach((k) =>
                        onUpdateSeriesVisual(k, { axis: "left", chartType: "line" }),
                      );
                    }}
                    className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-slate-500 hover:text-slate-100"
                  >
                    一键重置轴
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      bySlot[slot].forEach((k) =>
                        onUpdateSeriesVisual(k, { chartType: "stackArea" }),
                      );
                    }}
                    className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-slate-500 hover:text-slate-100"
                  >
                    一键堆叠面积
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      bySlot[slot].forEach((k) =>
                        onUpdateSeriesVisual(k, { chartType: "stackBar" }),
                      );
                    }}
                    className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-slate-500 hover:text-slate-100"
                  >
                    一键堆叠柱状
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      bySlot[slot].forEach((k) =>
                        onUpdateSeriesVisual(k, { chartType: "line" }),
                      );
                    }}
                    className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-slate-500 hover:text-slate-100"
                  >
                    取消堆叠
                  </button>
                </div>
              ) : null}
            </div>
            <div className="flex min-h-[36px] flex-wrap gap-1.5">
              {bySlot[slot].length === 0 ? (
                <span className="text-[11px] text-slate-600">拖入指标…</span>
              ) : (
                bySlot[slot].map((key) => {
                  const cfg = seriesVisualMap[key] ?? {};
                  return (
                    <div
                      key={key}
                      className="rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-200"
                      title={key}
                    >
                      <button
                        type="button"
                        draggable
                        onDragStart={startDrag(key)}
                        className="cursor-grab text-left text-[11px] text-slate-200 active:cursor-grabbing"
                      >
                        {unifiedSeriesDisplayName(key)}
                      </button>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <label className="flex items-center gap-1 text-[10px] text-slate-400">
                          轴
                          <select
                            value={cfg.axis ?? "left"}
                            onChange={(e) =>
                              onUpdateSeriesVisual(key, {
                                axis: e.target.value as MacroSeriesAxis,
                              })
                            }
                            className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
                          >
                            <option value="left">左轴</option>
                            <option value="right">右轴</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-slate-400">
                          图形
                          <select
                            value={cfg.chartType ?? "line"}
                            onChange={(e) =>
                              onUpdateSeriesVisual(key, {
                                chartType: e.target.value as MacroSeriesChartType,
                              })
                            }
                            className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
                          >
                            {CHART_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        {...dragProps({ kind: "pool" })}
        className={`rounded-lg border border-dashed px-2 py-3 transition-colors ${
          dropActive({ kind: "pool" })
            ? "border-amber-500 bg-amber-950/25"
            : "border-slate-700 bg-slate-950/50"
        }`}
      >
        <div className="mb-1.5 text-[11px] font-medium text-slate-400">待选集</div>
        <p className="mb-2 text-[10px] leading-relaxed text-slate-600">
          已勾选、但未指定到任一图的指标放在此处。
        </p>
        <div className="flex min-h-[36px] flex-wrap gap-1.5">
          {pool.length === 0 ? (
            <span className="text-[11px] text-slate-600">无</span>
          ) : (
            pool.map((key) => (
              <button
                key={key}
                type="button"
                draggable
                onDragStart={startDrag(key)}
                className="cursor-grab rounded border border-slate-600 bg-slate-950 px-2 py-1 text-left text-[11px] text-slate-200 active:cursor-grabbing"
                title={key}
              >
                {unifiedSeriesDisplayName(key)}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
