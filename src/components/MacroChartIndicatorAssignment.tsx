"use client";

import { useState, type DragEvent } from "react";
import { unifiedSeriesDisplayName } from "@/lib/data/macroCatalog";
import type { MacroSlotAssignment } from "@/lib/macroPartition";

const DRAG_TYPE = "application/x-finance-macro-key";

export type MacroChartIndicatorAssignmentProps = {
  layoutMode: 1 | 2 | 3 | 4;
  selectedKeys: Set<string>;
  slotAssignment: MacroSlotAssignment;
  onAssign: (key: string, slot: number | null) => void;
};

/** 图形属性 · 指标选择：按图槽位与「待选集」拖拽分配 */
export function MacroChartIndicatorAssignment({
  layoutMode,
  selectedKeys,
  slotAssignment,
  onAssign,
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
            <div className="mb-1.5 text-[11px] font-medium text-slate-400">图 {slot + 1}</div>
            <div className="flex min-h-[36px] flex-wrap gap-1.5">
              {bySlot[slot].length === 0 ? (
                <span className="text-[11px] text-slate-600">拖入指标…</span>
              ) : (
                bySlot[slot].map((key) => (
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
