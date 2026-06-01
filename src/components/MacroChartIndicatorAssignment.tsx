"use client";

import { useState, type DragEvent } from "react";
import { unifiedSeriesDisplayName } from "@/lib/data/macroCatalog";
import type { MacroSlotAssignment } from "@/lib/macroPartition";
import type {
  MacroChartDisplayConfig,
  MacroSeriesAxis,
  MacroSeriesChartType,
  MacroSeriesVisualConfig,
  MacroSeriesVisualConfigMap,
} from "@/lib/macroChartOption";

const DRAG_TYPE = "application/x-finance-macro-key";

export type MacroChartIndicatorAssignmentProps = {
  layoutMode: 1 | 2 | 3 | 4 | 5 | 6;
  selectedKeys: Set<string>;
  displayLabelByKey?: Map<string, string>;
  slotAssignment: MacroSlotAssignment;
  onAssign: (key: string, slot: number | null) => void;
  seriesVisualMap: MacroSeriesVisualConfigMap;
  onUpdateSeriesVisual: (
    key: string,
    patch: Partial<MacroSeriesVisualConfig>,
  ) => void;
  displayConfig: MacroChartDisplayConfig;
  onUpdateDisplayConfig: (patch: Partial<MacroChartDisplayConfig>) => void;
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
  displayLabelByKey,
  slotAssignment,
  onAssign,
  seriesVisualMap,
  onUpdateSeriesVisual,
  displayConfig,
  onUpdateDisplayConfig,
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

  function parseIntSafe(v: string, fallback: number): number {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function parseFloatSafe(v: string, fallback: number): number {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function displayNameForKey(key: string): string {
    const fromCatalog = displayLabelByKey?.get(key)?.trim();
    if (fromCatalog) return fromCatalog;
    return unifiedSeriesDisplayName(key);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900/35 px-2 py-2">
        <div className="mb-1 text-[11px] font-medium text-slate-400">图例与交互</div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="flex items-center gap-1.5 text-slate-300">
            <input
              type="checkbox"
              checked={displayConfig.showLegend}
              onChange={(e) => onUpdateDisplayConfig({ showLegend: e.target.checked })}
              className="accent-emerald-600"
            />
            显示图例
          </label>
          <label className="flex items-center gap-1.5 text-slate-300">
            <input
              type="checkbox"
              checked={displayConfig.showTooltip}
              onChange={(e) => onUpdateDisplayConfig({ showTooltip: e.target.checked })}
              className="accent-emerald-600"
            />
            十字线提示
          </label>
          <label className="text-slate-400">
            图例位置
            <select
              value={displayConfig.legendPosition}
              onChange={(e) =>
                onUpdateDisplayConfig({
                  legendPosition: e.target.value as MacroChartDisplayConfig["legendPosition"],
                })
              }
              className="ml-1 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
            >
              <option value="bottom">底部</option>
              <option value="top">顶部</option>
            </select>
          </label>
          <label className="text-slate-400">
            末值小数位
            <input
              type="number"
              min={0}
              max={6}
              value={displayConfig.endLabelDecimals}
              onChange={(e) =>
                onUpdateDisplayConfig({
                  endLabelDecimals: Math.max(0, Math.min(6, parseIntSafe(e.target.value, 2))),
                })
              }
              className="ml-1 w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/35 px-2 py-2">
        <div className="mb-1 text-[11px] font-medium text-slate-400">坐标与网格</div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="flex items-center gap-1.5 text-slate-300">
            <input
              type="checkbox"
              checked={displayConfig.showGridLines}
              onChange={(e) => onUpdateDisplayConfig({ showGridLines: e.target.checked })}
              className="accent-emerald-600"
            />
            显示网格线
          </label>
          <label className="flex items-center gap-1.5 text-slate-300">
            <input
              type="checkbox"
              checked={displayConfig.lineSmooth}
              onChange={(e) => onUpdateDisplayConfig({ lineSmooth: e.target.checked })}
              className="accent-emerald-600"
            />
            线条平滑
          </label>
          <label className="text-slate-400">
            X轴旋转
            <input
              type="number"
              min={0}
              max={80}
              value={displayConfig.xLabelRotate}
              onChange={(e) =>
                onUpdateDisplayConfig({
                  xLabelRotate: Math.max(0, Math.min(80, parseIntSafe(e.target.value, 30))),
                })
              }
              className="ml-1 w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
            />
          </label>
          <label className="text-slate-400">
            X轴字号
            <input
              type="number"
              min={8}
              max={16}
              value={displayConfig.xLabelFontSize}
              onChange={(e) =>
                onUpdateDisplayConfig({
                  xLabelFontSize: Math.max(8, Math.min(16, parseIntSafe(e.target.value, 11))),
                })
              }
              className="ml-1 w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
            />
          </label>
          <label className="text-slate-400">
            Y轴字号
            <input
              type="number"
              min={8}
              max={16}
              value={displayConfig.yLabelFontSize}
              onChange={(e) =>
                onUpdateDisplayConfig({
                  yLabelFontSize: Math.max(8, Math.min(16, parseIntSafe(e.target.value, 11))),
                })
              }
              className="ml-1 w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/35 px-2 py-2">
        <div className="mb-1 text-[11px] font-medium text-slate-400">图形默认样式</div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="flex items-center gap-1.5 text-slate-300">
            <input
              type="checkbox"
              checked={displayConfig.showSymbols}
              onChange={(e) => onUpdateDisplayConfig({ showSymbols: e.target.checked })}
              className="accent-emerald-600"
            />
            显示拐点
          </label>
          <label className="text-slate-400">
            线宽
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={displayConfig.lineWidth}
              onChange={(e) =>
                onUpdateDisplayConfig({
                  lineWidth: Math.max(1, Math.min(5, parseFloatSafe(e.target.value, 1.8))),
                })
              }
              className="ml-1 w-14 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
            />
          </label>
          <label className="text-slate-400">
            面积透明度
            <input
              type="number"
              min={0.05}
              max={1}
              step={0.05}
              value={displayConfig.areaOpacity}
              onChange={(e) =>
                onUpdateDisplayConfig({
                  areaOpacity: Math.max(0.05, Math.min(1, parseFloatSafe(e.target.value, 0.22))),
                })
              }
              className="ml-1 w-14 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
            />
          </label>
          <label className="text-slate-400">
            柱宽
            <input
              type="number"
              min={6}
              max={40}
              value={displayConfig.barMaxWidth}
              onChange={(e) =>
                onUpdateDisplayConfig({
                  barMaxWidth: Math.max(6, Math.min(40, parseIntSafe(e.target.value, 22))),
                })
              }
              className="ml-1 w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
            />
          </label>
          <label className="text-slate-400">
            点大小
            <input
              type="number"
              min={2}
              max={16}
              value={displayConfig.symbolSize}
              onChange={(e) =>
                onUpdateDisplayConfig({
                  symbolSize: Math.max(2, Math.min(16, parseIntSafe(e.target.value, 7))),
                })
              }
              className="ml-1 w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
            />
          </label>
        </div>
      </div>

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
                        {displayNameForKey(key)}
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
                        <label className="flex items-center gap-1 text-[10px] text-slate-400">
                          线宽
                          <input
                            type="number"
                            min={1}
                            max={5}
                            step={0.1}
                            value={cfg.lineWidth ?? displayConfig.lineWidth}
                            onChange={(e) =>
                              onUpdateSeriesVisual(key, {
                                lineWidth: parseFloatSafe(e.target.value, displayConfig.lineWidth),
                              })
                            }
                            className="w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-slate-400">
                          透明
                          <input
                            type="number"
                            min={0.1}
                            max={1}
                            step={0.1}
                            value={cfg.opacity ?? 1}
                            onChange={(e) =>
                              onUpdateSeriesVisual(key, {
                                opacity: Math.max(0.1, Math.min(1, parseFloatSafe(e.target.value, 1))),
                              })
                            }
                            className="w-12 rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-200"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-slate-400">
                          平滑
                          <input
                            type="checkbox"
                            checked={cfg.smooth ?? displayConfig.lineSmooth}
                            onChange={(e) =>
                              onUpdateSeriesVisual(key, { smooth: e.target.checked })
                            }
                            className="accent-emerald-600"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-slate-400">
                          点
                          <input
                            type="checkbox"
                            checked={cfg.showSymbol ?? displayConfig.showSymbols}
                            onChange={(e) =>
                              onUpdateSeriesVisual(key, { showSymbol: e.target.checked })
                            }
                            className="accent-emerald-600"
                          />
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
                {displayNameForKey(key)}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
