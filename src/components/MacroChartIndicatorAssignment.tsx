"use client";

import { useState, type DragEvent } from "react";
import { unifiedSeriesDisplayName } from "@/lib/data/macroCatalog";
import type { MacroSlotAssignment } from "@/lib/macroPartition";
import type {
  MacroChartDisplayConfig,
  MacroChartSlotMode,
  MacroSeriesAxis,
  MacroSeriesChartType,
  MacroSeriesVisualConfig,
  MacroSeriesVisualConfigMap,
} from "@/lib/macroChartOption";
import {
  DEFAULT_SEASONAL_YEAR_COUNT,
  resolveSlotSeasonalYearCount,
} from "@/lib/macroChartOption";
import { MacroChartAxisSettings } from "@/components/MacroChartAxisSettings";
import type { MacroPayload } from "@/lib/data/types";

const DRAG_TYPE = "application/x-finance-macro-key";

export type MacroChartPropsTab = "global" | "single" | "axis";

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
  /** 数据中的可选年份（饼图） */
  availableYears?: string[];
  /** 轴设置页：用于按图槽计算自动范围 */
  chartPayload?: MacroPayload | null;
  tab: MacroChartPropsTab;
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
  availableYears = [],
  chartPayload = null,
  tab,
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
          const slot = dropTarget.slot;
          if (slotMode(slot) === "seasonal") {
            const existing = bySlot[slot];
            for (const k of existing) {
              if (k !== key) onAssign(k, null);
            }
          }
          onAssign(key, slot);
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

  function slotMode(slot: number): MacroChartSlotMode {
    return displayConfig.slotModes?.[slot] ?? "timeSeries";
  }

  function ensureSeasonalSingleIndicator(slot: number, keepKey?: string) {
    for (const k of bySlot[slot]) {
      if (k !== keepKey) onAssign(k, null);
    }
  }

  function setSlotMode(slot: number, mode: MacroChartSlotMode) {
    if (mode === "seasonal") {
      ensureSeasonalSingleIndicator(slot, bySlot[slot][0]);
    }
    const nextModes = { ...displayConfig.slotModes, [slot]: mode };
    const patch: Partial<MacroChartDisplayConfig> = { slotModes: nextModes };
    if (mode === "pie" && availableYears.length > 0) {
      const currentYear = displayConfig.slotPieYears?.[slot];
      if (!currentYear || !availableYears.includes(currentYear)) {
        patch.slotPieYears = {
          ...displayConfig.slotPieYears,
          [slot]: availableYears[0],
        };
      }
    }
    if (mode === "seasonal" && displayConfig.slotSeasonalYearCount?.[slot] === undefined) {
      patch.slotSeasonalYearCount = {
        ...displayConfig.slotSeasonalYearCount,
        [slot]: DEFAULT_SEASONAL_YEAR_COUNT,
      };
    }
    onUpdateDisplayConfig(patch);
  }

  function setSlotSeasonalYearCount(slot: number, count: number) {
    onUpdateDisplayConfig({
      slotSeasonalYearCount: {
        ...displayConfig.slotSeasonalYearCount,
        [slot]: Math.max(2, Math.min(15, Math.floor(count))),
      },
    });
  }

  function setSlotPieYear(slot: number, year: string) {
    onUpdateDisplayConfig({
      slotPieYears: { ...displayConfig.slotPieYears, [slot]: year },
    });
  }

  function slotShowTitle(slot: number): boolean {
    return displayConfig.slotShowTitles?.[slot] ?? true;
  }

  function setSlotShowTitle(slot: number, show: boolean) {
    onUpdateDisplayConfig({
      slotShowTitles: { ...displayConfig.slotShowTitles, [slot]: show },
    });
  }

  function setSlotTitle(slot: number, text: string) {
    onUpdateDisplayConfig({
      slotTitles: { ...displayConfig.slotTitles, [slot]: text },
    });
  }

  const ctrlSelect =
    "shrink-0 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[11px] text-fs-text";
  const ctrlNum =
    "w-10 shrink-0 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-center text-[11px] text-fs-text";

  return (
    <div className="flex flex-col gap-3">
      {tab === "axis" ? (
        chartPayload ? (
          <MacroChartAxisSettings
            layoutMode={layoutMode}
            payload={chartPayload}
            slotAssignment={slotAssignment}
            seriesVisualMap={seriesVisualMap}
            displayConfig={displayConfig}
            onUpdateDisplayConfig={onUpdateDisplayConfig}
          />
        ) : (
          <p className="text-[11px] text-fs-muted">暂无图表数据，无法设置坐标轴范围。</p>
        )
      ) : tab === "global" ? (
        <>
      <div className="rounded-lg border border-fs-border bg-fs-elevated/35 px-2 py-2">
        <div className="mb-1 text-[11px] font-medium text-fs-muted">图例与交互</div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="flex items-center gap-1.5 text-fs-secondary">
            <input
              type="checkbox"
              checked={displayConfig.showLegend}
              onChange={(e) => onUpdateDisplayConfig({ showLegend: e.target.checked })}
              className="accent-fs-accent"
            />
            显示图例
          </label>
          <label className="flex items-center gap-1.5 text-fs-secondary">
            <input
              type="checkbox"
              checked={displayConfig.showTooltip}
              onChange={(e) => onUpdateDisplayConfig({ showTooltip: e.target.checked })}
              className="accent-fs-accent"
            />
            十字线提示
          </label>
          <label className="text-fs-muted">
            图例位置
            <select
              value={displayConfig.legendPosition}
              onChange={(e) =>
                onUpdateDisplayConfig({
                  legendPosition: e.target.value as MacroChartDisplayConfig["legendPosition"],
                })
              }
              className="ml-1 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            >
              <option value="bottom">底部</option>
              <option value="top">顶部</option>
            </select>
          </label>
          <label className="text-fs-muted">
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
              className="ml-1 w-12 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-fs-border bg-fs-elevated/35 px-2 py-2">
        <div className="mb-1 text-[11px] font-medium text-fs-muted">坐标与网格</div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="flex items-center gap-1.5 text-fs-secondary">
            <input
              type="checkbox"
              checked={displayConfig.showGridLines}
              onChange={(e) => onUpdateDisplayConfig({ showGridLines: e.target.checked })}
              className="accent-fs-accent"
            />
            显示网格线
          </label>
          <label className="flex items-center gap-1.5 text-fs-secondary">
            <input
              type="checkbox"
              checked={displayConfig.lineSmooth}
              onChange={(e) => onUpdateDisplayConfig({ lineSmooth: e.target.checked })}
              className="accent-fs-accent"
            />
            线条平滑
          </label>
          <label className="text-fs-muted">
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
              className="ml-1 w-12 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            />
          </label>
          <label className="text-fs-muted">
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
              className="ml-1 w-12 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            />
          </label>
          <label className="text-fs-muted">
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
              className="ml-1 w-12 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-fs-border bg-fs-elevated/35 px-2 py-2">
        <div className="mb-1 text-[11px] font-medium text-fs-muted">图形默认样式</div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="flex items-center gap-1.5 text-fs-secondary">
            <input
              type="checkbox"
              checked={displayConfig.showSymbols}
              onChange={(e) => onUpdateDisplayConfig({ showSymbols: e.target.checked })}
              className="accent-fs-accent"
            />
            显示拐点
          </label>
          <label className="text-fs-muted">
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
              className="ml-1 w-14 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            />
          </label>
          <label className="text-fs-muted">
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
              className="ml-1 w-14 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            />
          </label>
          <label className="text-fs-muted">
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
              className="ml-1 w-12 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            />
          </label>
          <label className="text-fs-muted">
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
              className="ml-1 w-12 rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            />
          </label>
        </div>
      </div>
        </>
      ) : (
        <>
      <div className="flex flex-col gap-2">
        {Array.from({ length: layoutMode }, (_, slot) => (
          <div
            key={slot}
            {...dragProps({ kind: "slot", slot })}
            className={`rounded-md border px-2 py-1.5 transition-colors ${
              dropActive({ kind: "slot", slot })
                ? "border-fs-accent bg-fs-accent-soft"
                : "border-fs-border bg-fs-elevated/40"
            }`}
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <input
                type="checkbox"
                checked={slotShowTitle(slot)}
                onChange={(e) => setSlotShowTitle(slot, e.target.checked)}
                className="accent-fs-accent"
                title="在图表上显示名称"
              />
              <input
                type="text"
                value={displayConfig.slotTitles?.[slot] ?? ""}
                onChange={(e) => setSlotTitle(slot, e.target.value)}
                disabled={!slotShowTitle(slot)}
                placeholder={`图 ${slot + 1}`}
                className="min-w-0 flex-1 rounded border border-fs-border bg-fs-bg px-1.5 py-0.5 text-[11px] text-fs-secondary placeholder:text-fs-secondary disabled:opacity-40"
              />
              <select
                value={slotMode(slot)}
                onChange={(e) => setSlotMode(slot, e.target.value as MacroChartSlotMode)}
                className={ctrlSelect}
                title="展示类型"
              >
                <option value="timeSeries">时序</option>
                <option value="seasonal">季节图</option>
                <option value="pie">饼图</option>
              </select>
              {slotMode(slot) === "seasonal" ? (
                <label className="flex shrink-0 items-center gap-0.5 text-[10px] text-fs-muted" title="展示近几年">
                  近
                  <input
                    type="number"
                    min={2}
                    max={15}
                    value={resolveSlotSeasonalYearCount(displayConfig.slotSeasonalYearCount, slot)}
                    onChange={(e) =>
                      setSlotSeasonalYearCount(
                        slot,
                        parseIntSafe(e.target.value, DEFAULT_SEASONAL_YEAR_COUNT),
                      )
                    }
                    className={`${ctrlNum} w-10`}
                  />
                  年
                </label>
              ) : null}
              {slotMode(slot) === "pie" ? (
                <select
                  value={displayConfig.slotPieYears?.[slot] ?? availableYears[0] ?? ""}
                  onChange={(e) => setSlotPieYear(slot, e.target.value)}
                  disabled={availableYears.length === 0}
                  className={`${ctrlSelect} w-14`}
                  title="数据年份"
                >
                  {availableYears.length === 0 ? (
                    <option value="">—</option>
                  ) : (
                    availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))
                  )}
                </select>
              ) : null}
            </div>
            <div className="flex min-h-[28px] flex-col gap-1">
              {bySlot[slot].length === 0 ? (
                <span className="text-[11px] text-fs-secondary">拖入指标…</span>
              ) : (
                bySlot[slot].map((key) => {
                  const cfg = seriesVisualMap[key] ?? {};
                  const isPieSlot = slotMode(slot) === "pie";
                  const isSeasonalSlot = slotMode(slot) === "seasonal";
                  const isAltSlot = isPieSlot || isSeasonalSlot;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-1 rounded border border-fs-border/80 bg-white/95 px-1 py-0.5"
                      title={key}
                    >
                      <button
                        type="button"
                        draggable
                        onDragStart={startDrag(key)}
                        className="min-w-0 flex-1 cursor-grab truncate text-left text-[11px] text-fs-secondary active:cursor-grabbing"
                      >
                        {displayNameForKey(key)}
                      </button>
                      <input
                        type="color"
                        value={cfg.color ?? "#64748b"}
                        onChange={(e) =>
                          onUpdateSeriesVisual(key, { color: e.target.value })
                        }
                        title="颜色"
                        className="h-5 w-6 shrink-0 cursor-pointer rounded border border-fs-border bg-fs-elevated p-0"
                      />
                      {!isAltSlot ? (
                        <>
                          <select
                            value={cfg.axis ?? "left"}
                            onChange={(e) =>
                              onUpdateSeriesVisual(key, {
                                axis: e.target.value as MacroSeriesAxis,
                              })
                            }
                            className={`${ctrlSelect} w-11`}
                            title="坐标轴"
                          >
                            <option value="left">左</option>
                            <option value="right">右</option>
                          </select>
                          <select
                            value={cfg.chartType ?? "line"}
                            onChange={(e) =>
                              onUpdateSeriesVisual(key, {
                                chartType: e.target.value as MacroSeriesChartType,
                              })
                            }
                            className={`${ctrlSelect} max-w-[5rem]`}
                            title="图形类型"
                          >
                            {CHART_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
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
                            className={ctrlNum}
                            title="线宽"
                          />
                          <input
                            type="number"
                            min={0.1}
                            max={1}
                            step={0.1}
                            value={cfg.opacity ?? 1}
                            onChange={(e) =>
                              onUpdateSeriesVisual(key, {
                                opacity: Math.max(
                                  0.1,
                                  Math.min(1, parseFloatSafe(e.target.value, 1)),
                                ),
                              })
                            }
                            className={ctrlNum}
                            title="透明度"
                          />
                        </>
                      ) : null}
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
        className={`rounded-md border border-dashed px-2 py-2 transition-colors ${
          dropActive({ kind: "pool" })
            ? "border-amber-500 bg-amber-950/25"
            : "border-fs-border bg-fs-elevated"
        }`}
      >
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <span className="shrink-0 text-[11px] font-medium text-fs-muted">待选集</span>
          <p className="min-w-0 flex-1 text-right text-[11px] leading-relaxed text-fs-secondary">
            拖指标到各图绘制；拖到待选集则不绘制。
          </p>
        </div>
        <div className="flex min-h-[24px] flex-wrap gap-1">
          {pool.length === 0 ? (
            <span className="text-[11px] text-fs-secondary">无</span>
          ) : (
            pool.map((key) => (
              <button
                key={key}
                type="button"
                draggable
                onDragStart={startDrag(key)}
                className="cursor-grab rounded border border-fs-border bg-fs-bg px-1.5 py-0.5 text-left text-[11px] text-fs-secondary active:cursor-grabbing"
                title={key}
              >
                {displayNameForKey(key)}
              </button>
            ))
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
