"use client";

import { useMemo } from "react";
import type { MacroPayload } from "@/lib/data/types";
import { partitionMacroSeries, type MacroSlotAssignment } from "@/lib/macroPartition";
import type {
  MacroAxisRange,
  MacroChartDisplayConfig,
  MacroChartSlotMode,
  MacroSeriesVisualConfigMap,
  MacroSlotAxisRanges,
} from "@/lib/macroChartOption";
import {
  computeAxisExtentFromSlice,
  isAltMacroSlotMode,
  resolveMacroSlotTitle,
} from "@/lib/macroChartOption";

export type MacroChartAxisSettingsProps = {
  layoutMode: 1 | 2 | 3 | 4 | 5 | 6;
  payload: MacroPayload;
  slotAssignment: MacroSlotAssignment;
  seriesVisualMap: MacroSeriesVisualConfigMap;
  displayConfig: MacroChartDisplayConfig;
  onUpdateDisplayConfig: (patch: Partial<MacroChartDisplayConfig>) => void;
};

function parseNumInput(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

function slotMode(displayConfig: MacroChartDisplayConfig, slot: number): MacroChartSlotMode {
  return displayConfig.slotModes?.[slot] ?? "timeSeries";
}

const ALT_AXIS_HINT: Partial<Record<MacroChartSlotMode, string>> = {
  pie: "饼图无 Y 轴范围设置",
  waterfall: "瀑布图无传统左右 Y 轴范围设置",
  heatmap: "热力图无传统左右 Y 轴范围设置",
  xyScatter: "XY 散点使用数值双轴，暂不支持手动范围",
  boxplot: "箱线图无传统左右 Y 轴范围设置",
  radar: "雷达图无传统左右 Y 轴范围设置",
};

function slotRanges(
  displayConfig: MacroChartDisplayConfig,
  slot: number,
): MacroSlotAxisRanges {
  return displayConfig.slotAxisRanges?.[slot] ?? {};
}

function axisRange(
  displayConfig: MacroChartDisplayConfig,
  slot: number,
  side: "left" | "right",
): MacroAxisRange {
  return slotRanges(displayConfig, slot)[side] ?? { mode: "auto" };
}

export function MacroChartAxisSettings({
  layoutMode,
  payload,
  slotAssignment,
  seriesVisualMap,
  displayConfig,
  onUpdateDisplayConfig,
}: MacroChartAxisSettingsProps) {
  const buckets = useMemo(
    () => partitionMacroSeries(payload, layoutMode, slotAssignment),
    [payload, layoutMode, slotAssignment],
  );

  function patchSlotAxis(
    slot: number,
    side: "left" | "right",
    patch: Partial<MacroAxisRange>,
  ) {
    const prevSlot = slotRanges(displayConfig, slot);
    const prevSide = prevSlot[side] ?? { mode: "auto" as const };
    onUpdateDisplayConfig({
      slotAxisRanges: {
        ...displayConfig.slotAxisRanges,
        [slot]: {
          ...prevSlot,
          [side]: { ...prevSide, ...patch },
        },
      },
    });
  }

  function setAllAuto() {
    onUpdateDisplayConfig({ slotAxisRanges: {} });
  }

  function autoFillAxis(slot: number, side: "left" | "right") {
    const series = buckets[slot] ?? [];
    if (series.length === 0) return;
    const slice = {
      categories: payload.categories,
      series: side === "left" && slotMode(displayConfig, slot) === "seasonal"
        ? series.slice(0, 1)
        : series,
    };
    const extent = computeAxisExtentFromSlice(slice, seriesVisualMap, side);
    if (!extent) return;
    patchSlotAxis(slot, side, {
      mode: "manual",
      min: Number(extent.min.toFixed(4)),
      max: Number(extent.max.toFixed(4)),
    });
  }

  function slotHasRightAxis(slot: number): boolean {
    const series = buckets[slot] ?? [];
    return series.some((s) => seriesVisualMap[s.key ?? s.name]?.axis === "right");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-fs-muted">
          为每副图单独设置左右 Y 轴范围；自动模式随当前图内数据缩放。
        </p>
        <button
          type="button"
          onClick={setAllAuto}
          className="shrink-0 rounded border border-fs-border px-2 py-0.5 text-[10px] text-fs-muted hover:border-fs-border hover:text-fs-text"
        >
          全部自动
        </button>
      </div>

      {Array.from({ length: layoutMode }, (_, slot) => {
        const mode = slotMode(displayConfig, slot);
        const title =
          resolveMacroSlotTitle(slot, layoutMode, displayConfig, {
            seriesLabel: buckets[slot]?.[0]?.name,
          }) ?? `图 ${slot + 1}`;
        const seriesCount = buckets[slot]?.length ?? 0;

        if (mode === "pie" || (isAltMacroSlotMode(mode) && mode !== "seasonal")) {
          return (
            <div
              key={slot}
              className="rounded-md border border-fs-border bg-fs-elevated/40 px-2 py-1.5"
            >
              <div className="text-[11px] font-medium text-fs-muted">{title}</div>
              <p className="mt-0.5 text-[10px] text-fs-secondary">
                {ALT_AXIS_HINT[mode] ?? "当前图种无 Y 轴范围设置"}
              </p>
            </div>
          );
        }

        if (seriesCount === 0) {
          return (
            <div
              key={slot}
              className="rounded-md border border-fs-border bg-fs-elevated/40 px-2 py-1.5"
            >
              <div className="text-[11px] font-medium text-fs-muted">{title}</div>
              <p className="mt-0.5 text-[10px] text-fs-secondary">暂无指标</p>
            </div>
          );
        }

        const hasRight = slotHasRightAxis(slot);
        const left = axisRange(displayConfig, slot, "left");
        const right = axisRange(displayConfig, slot, "right");

        return (
          <div
            key={slot}
            className="rounded-md border border-fs-border bg-fs-elevated/40 px-2 py-1.5"
          >
            <div className="mb-1.5 text-[11px] font-medium text-fs-secondary">{title}</div>
            <AxisSideRow
              fieldId={`${slot}-left`}
              label="左轴"
              range={left}
              onModeChange={(mode) =>
                patchSlotAxis(slot, "left", {
                  mode,
                  ...(mode === "auto" ? { min: undefined, max: undefined } : {}),
                })
              }
              onMinChange={(min) => patchSlotAxis(slot, "left", { min, mode: "manual" })}
              onMaxChange={(max) => patchSlotAxis(slot, "left", { max, mode: "manual" })}
              onAutoFill={() => autoFillAxis(slot, "left")}
            />
            <AxisSideRow
              fieldId={`${slot}-right`}
              label="右轴"
              range={right}
              disabled={!hasRight}
              disabledHint="无右轴序列"
              onModeChange={(mode) =>
                patchSlotAxis(slot, "right", {
                  mode,
                  ...(mode === "auto" ? { min: undefined, max: undefined } : {}),
                })
              }
              onMinChange={(min) => patchSlotAxis(slot, "right", { min, mode: "manual" })}
              onMaxChange={(max) => patchSlotAxis(slot, "right", { max, mode: "manual" })}
              onAutoFill={() => autoFillAxis(slot, "right")}
            />
          </div>
        );
      })}
    </div>
  );
}

function AxisSideRow({
  fieldId,
  label,
  range,
  disabled,
  disabledHint,
  onModeChange,
  onMinChange,
  onMaxChange,
  onAutoFill,
}: {
  fieldId: string;
  label: string;
  range: MacroAxisRange;
  disabled?: boolean;
  disabledHint?: string;
  onModeChange: (mode: "auto" | "manual") => void;
  onMinChange: (min: number | undefined) => void;
  onMaxChange: (max: number | undefined) => void;
  onAutoFill: () => void;
}) {
  const mode = range.mode ?? "auto";
  const isManual = mode === "manual";

  if (disabled) {
    return (
      <div className="mb-1 flex items-center gap-2 text-[10px] text-fs-secondary last:mb-0">
        <span className="w-7 shrink-0">{label}</span>
        <span>{disabledHint ?? "不可用"}</span>
      </div>
    );
  }

  const inputCls =
    "w-16 rounded border border-fs-border bg-fs-bg px-1 py-0.5 text-center text-[10px] text-fs-text disabled:opacity-40";

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 last:mb-0">
      <span className="w-7 shrink-0 text-[10px] text-fs-muted">{label}</span>
      <label className="flex items-center gap-0.5 text-[10px] text-fs-muted">
        <input
          type="radio"
          name={`axis-mode-${fieldId}`}
          checked={mode === "auto"}
          onChange={() => onModeChange("auto")}
          className="accent-fs-accent"
        />
        自动
      </label>
      <label className="flex items-center gap-0.5 text-[10px] text-fs-muted">
        <input
          type="radio"
          name={`axis-mode-${fieldId}`}
          checked={mode === "manual"}
          onChange={() => onModeChange("manual")}
          className="accent-fs-accent"
        />
        手动
      </label>
      <span className="text-[10px] text-fs-secondary">最小</span>
      <input
        type="number"
        step="any"
        disabled={!isManual}
        value={range.min ?? ""}
        onChange={(e) => onMinChange(parseNumInput(e.target.value))}
        className={inputCls}
      />
      <span className="text-[10px] text-fs-secondary">最大</span>
      <input
        type="number"
        step="any"
        disabled={!isManual}
        value={range.max ?? ""}
        onChange={(e) => onMaxChange(parseNumInput(e.target.value))}
        className={inputCls}
      />
      <button
        type="button"
        onClick={onAutoFill}
        className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-muted hover:border-fs-border hover:text-fs-text"
        title="按当前图内数据计算并填入最小/最大"
      >
        按数据填入
      </button>
    </div>
  );
}
