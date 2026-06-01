"use client";

import type { EChartsType } from "echarts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MacroPayload } from "@/lib/data/types";
import { MacroChartPanel } from "@/components/MacroChartPanel";
import { MacroTimeRangeNavigator } from "@/components/MacroTimeRangeNavigator";
import { partitionMacroSeries, type MacroSlotAssignment } from "@/lib/macroPartition";
import type { MacroChartSlice } from "@/lib/macroChartOption";
import type { MacroChartDisplayConfig, MacroSeriesVisualConfigMap } from "@/lib/macroChartOption";
import type { MacroDrawing, MacroDrawingTool } from "@/lib/macroChartDrawing";
import { indicesFromDataZoomPct } from "@/lib/timeRangeSlice";
import { dataIndexFromConvert } from "@/lib/timeCursor";

export type MacroMultiChartGridProps = {
  payload: MacroPayload;
  layoutMode: 1 | 2 | 3 | 4 | 5 | 6;
  slotAssignment: MacroSlotAssignment;
  seriesVisualMap?: MacroSeriesVisualConfigMap;
  displayConfig?: MacroChartDisplayConfig;
  pageSyncEnabled?: boolean;
  remoteCrosshairTimeLabel?: string | null;
  remoteCrosshairVersion?: number;
  onLocalCrosshairTimeLabel?: (timeLabel: string | null) => void;
  remoteVisibleRange?:
    | { startPct: number; endPct: number; fromLabel: string | null; toLabel: string | null }
    | null;
  remoteVisibleRangeVersion?: number;
  onLocalVisibleRange?: (payload: {
    startPct: number;
    endPct: number;
    fromLabel: string | null;
    toLabel: string | null;
  }) => void;
  /** 单图模式 ECharts 容器高度（CSS）；默认填满父级（宏观页父级为一屏高度链） */
  singleChartHeight?: string;
  drawTool?: MacroDrawingTool;
  drawingsBySlot?: Record<number, MacroDrawing[]>;
  onDrawingsChange?: (slotIndex: number, drawings: MacroDrawing[]) => void;
};

function categoriesOfChart(chart: EChartsType): string[] {
  const raw = chart.getOption()?.xAxis;
  const x0 = Array.isArray(raw) ? raw[0] : raw;
  const data = (x0 as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(data)) return [];
  return data.map((x) => String(x));
}

function indexForTimeLabel(cats: string[], label: string | null): number {
  if (!label || cats.length === 0) return -1;
  const exact = cats.findIndex((x) => x === label);
  if (exact >= 0) return exact;
  const target = Date.parse(label);
  if (!Number.isFinite(target)) return -1;
  let best = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cats.length; i++) {
    const t = Date.parse(cats[i] ?? "");
    if (!Number.isFinite(t)) continue;
    const d = Math.abs(t - target);
    if (d < bestDelta) {
      bestDelta = d;
      best = i;
    }
  }
  return Number.isFinite(bestDelta) ? best : -1;
}

/**
 * 多图十字线联动：在 ZRender 层监听 mousemove，用 convertFromPixel 得到当前横轴数据下标，
 * 再对其余图 dispatch updateAxisPointer + showTip。不依赖 echarts.connect（与 axisPointer 组合时易失效）。
 */
export function MacroMultiChartGrid({
  payload,
  layoutMode,
  slotAssignment,
  seriesVisualMap,
  displayConfig,
  pageSyncEnabled = false,
  remoteCrosshairTimeLabel = null,
  remoteCrosshairVersion = 0,
  onLocalCrosshairTimeLabel,
  remoteVisibleRange = null,
  remoteVisibleRangeVersion = 0,
  onLocalVisibleRange,
  singleChartHeight,
  drawTool = "cursor",
  drawingsBySlot = {},
  onDrawingsChange,
}: MacroMultiChartGridProps) {
  const buckets = useMemo(
    () => partitionMacroSeries(payload, layoutMode, slotAssignment),
    [payload, layoutMode, slotAssignment],
  );
  const compact = layoutMode > 1;

  /** 底部导航条：0–100，与全量类目对齐；切片后所有子图共用同一时间窗 */
  const [rangePct, setRangePct] = useState({ start: 0, end: 100 });

  const categoriesFingerprint = useMemo(
    () =>
      `${payload.categories.length}:${payload.categories[0] ?? ""}:${payload.categories[payload.categories.length - 1] ?? ""}`,
    [payload.categories],
  );

  useEffect(() => {
    setRangePct({ start: 0, end: 100 });
  }, [categoriesFingerprint]);

  const { i0, i1, visibleCategories } = useMemo(() => {
    const len = payload.categories.length;
    const { i0: a, i1: b } = indicesFromDataZoomPct(rangePct.start, rangePct.end, len);
    return {
      i0: a,
      i1: b,
      visibleCategories: len === 0 ? [] : payload.categories.slice(a, b + 1),
    };
  }, [payload.categories, rangePct.start, rangePct.end]);

  const onRangePctChange = useCallback((next: { start: number; end: number }) => {
    setRangePct((prev) => {
      if (
        Math.abs(prev.start - next.start) < 0.02 &&
        Math.abs(prev.end - next.end) < 0.02
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const chartSlots = useRef<(EChartsType | null)[]>([null, null, null, null, null, null]);
  const [registerRev, setRegisterRev] = useState(0);

  const onRegisterChart = useCallback((slot: number, chart: EChartsType | null) => {
    if (chartSlots.current[slot] === chart) return;
    chartSlots.current[slot] = chart;
    setRegisterRev((r) => r + 1);
  }, []);

  const onLocalCrosshairRef = useRef(onLocalCrosshairTimeLabel);
  const onLocalVisibleRangeRef = useRef(onLocalVisibleRange);
  const pageSyncEnabledRef = useRef(pageSyncEnabled);
  const suppressVisibleRangeBroadcastRef = useRef(false);
  useEffect(() => {
    onLocalCrosshairRef.current = onLocalCrosshairTimeLabel;
  }, [onLocalCrosshairTimeLabel]);
  useEffect(() => {
    onLocalVisibleRangeRef.current = onLocalVisibleRange;
  }, [onLocalVisibleRange]);
  useEffect(() => {
    pageSyncEnabledRef.current = pageSyncEnabled;
  }, [pageSyncEnabled]);

  useEffect(() => {
    if (!pageSyncEnabled || !onLocalVisibleRangeRef.current) return;
    if (suppressVisibleRangeBroadcastRef.current) return;
    const len = payload.categories.length;
    if (len === 0) return;
    const { i0: fromIdx, i1: toIdx } = indicesFromDataZoomPct(rangePct.start, rangePct.end, len);
    onLocalVisibleRangeRef.current({
      startPct: rangePct.start,
      endPct: rangePct.end,
      fromLabel: payload.categories[fromIdx] ?? null,
      toLabel: payload.categories[toIdx] ?? null,
    });
  }, [pageSyncEnabled, payload.categories, rangePct.end, rangePct.start]);

  const sliceForSlot = useCallback(
    (index: number): MacroChartSlice | null => {
      const series = buckets[index] ?? [];
      if (series.length === 0) return null;
      const slicedSeries = series.map((s) => ({
        ...s,
        data: s.data.slice(i0, i1 + 1),
      }));
      return {
        categories: visibleCategories,
        series: slicedSeries,
        title: layoutMode === 1 ? payload.title : undefined,
      };
    },
    [buckets, i0, i1, layoutMode, payload.title, visibleCategories],
  );

  useEffect(() => {
    const charts: EChartsType[] = [];
    for (let s = 0; s < layoutMode; s++) {
      const c = chartSlots.current[s];
      if (c && !c.isDisposed()) charts.push(c);
    }
    if (charts.length < 1) return undefined;

    const categories = visibleCategories;
    let linking = false;

    const cleanups: (() => void)[] = [];

    const hideAll = () => {
      charts.forEach((c) => {
        if (!c.isDisposed()) c.dispatchAction({ type: "hideTip" });
      });
      if (pageSyncEnabledRef.current) {
        onLocalCrosshairRef.current?.(null);
      }
    };

    charts.forEach((source, si) => {
      const zr = source.getZr();
      let raf = 0;

      const onMove = (e: { offsetX?: number; offsetY?: number }) => {
        if (linking) return;
        const ox = e.offsetX ?? 0;
        const oy = e.offsetY ?? 0;

        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          if (source.isDisposed()) return;
          try {
            if (!source.containPixel({ gridIndex: 0 }, [ox, oy])) return;
          } catch {
            return;
          }

          let dataIndex: number | null = null;
          try {
            const conv = source.convertFromPixel({ seriesIndex: 0 }, [ox, oy]);
            dataIndex = dataIndexFromConvert(conv, categories);
          } catch {
            return;
          }
          if (dataIndex === null) return;
          const timeLabel = categories[dataIndex] ?? null;
          if (!timeLabel) return;

          if (pageSyncEnabledRef.current) {
            onLocalCrosshairRef.current?.(timeLabel);
          }

          if (charts.length < 2) return;

          linking = true;
          try {
            charts.forEach((target, ti) => {
              if (ti === si || target.isDisposed()) return;
              const targetCats = categoriesOfChart(target);
              const targetIdx = indexForTimeLabel(targetCats, timeLabel);
              if (targetIdx < 0) return;
              target.dispatchAction({
                type: "updateAxisPointer",
                currTrigger: "mousemove",
                xAxisIndex: 0,
                dataIndex: targetIdx,
              });
              target.dispatchAction({
                type: "showTip",
                xAxisIndex: 0,
                dataIndex: targetIdx,
              });
            });
          } finally {
            queueMicrotask(() => {
              linking = false;
            });
          }
        });
      };

      zr.on("mousemove", onMove as never);
      cleanups.push(() => {
        cancelAnimationFrame(raf);
        zr.off("mousemove", onMove as never);
      });

      zr.on("globalout", hideAll);
      cleanups.push(() => zr.off("globalout", hideAll));
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
    }, [layoutMode, registerRev, visibleCategories]);

  useEffect(() => {
    if (!pageSyncEnabled || !remoteCrosshairVersion) return;
    const charts: EChartsType[] = [];
    for (let s = 0; s < layoutMode; s++) {
      const c = chartSlots.current[s];
      if (c && !c.isDisposed()) charts.push(c);
    }
    if (charts.length === 0) return;

    if (!remoteCrosshairTimeLabel) {
      charts.forEach((c) => c.dispatchAction({ type: "hideTip" }));
      return;
    }

    charts.forEach((target) => {
      const cats = categoriesOfChart(target);
      const idx = indexForTimeLabel(cats, remoteCrosshairTimeLabel);
      if (idx < 0) return;
      target.dispatchAction({
        type: "updateAxisPointer",
        currTrigger: "mousemove",
        xAxisIndex: 0,
        dataIndex: idx,
      });
      target.dispatchAction({
        type: "showTip",
        xAxisIndex: 0,
        dataIndex: idx,
      });
    });
  }, [
    layoutMode,
    pageSyncEnabled,
    registerRev,
    remoteCrosshairTimeLabel,
    remoteCrosshairVersion,
  ]);

  useEffect(() => {
    if (!pageSyncEnabled || !remoteVisibleRange || !remoteVisibleRangeVersion) return;
    const { startPct, endPct, fromLabel, toLabel } = remoteVisibleRange;
    const len = payload.categories.length;
    if (len < 2) return;

    let nextStart = Math.max(0, Math.min(100, startPct));
    let nextEnd = Math.max(0, Math.min(100, endPct));
    if (nextEnd - nextStart < 1) nextEnd = Math.min(100, nextStart + 1);

    const fromIdx = fromLabel ? payload.categories.findIndex((x) => x === fromLabel) : -1;
    const toIdx = toLabel ? payload.categories.findIndex((x) => x === toLabel) : -1;
    if (fromIdx >= 0 && toIdx >= 0 && toIdx > fromIdx) {
      nextStart = Math.max(0, Math.min(100, (fromIdx / Math.max(1, len - 1)) * 100));
      nextEnd = Math.max(0, Math.min(100, (toIdx / Math.max(1, len - 1)) * 100));
      if (nextEnd - nextStart < 1) nextEnd = Math.min(100, nextStart + 1);
    }

    suppressVisibleRangeBroadcastRef.current = true;
    setRangePct((prev) => {
      if (
        Math.abs(prev.start - nextStart) < 0.1 &&
        Math.abs(prev.end - nextEnd) < 0.1
      ) {
        return prev;
      }
      return { start: nextStart, end: nextEnd };
    });
    window.setTimeout(() => {
      suppressVisibleRangeBroadcastRef.current = false;
    }, 0);
  }, [
    pageSyncEnabled,
    payload.categories,
    remoteVisibleRange,
    remoteVisibleRangeVersion,
  ]);

  const navigator = (
    <MacroTimeRangeNavigator
      categories={payload.categories}
      previewData={payload.series[0]?.data ?? []}
      rangePct={rangePct}
      onRangePctChange={onRangePctChange}
    />
  );

  if (layoutMode === 1) {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <MacroChartPanel
            slice={sliceForSlot(0)}
            compact={false}
            seriesVisualMap={seriesVisualMap}
            displayConfig={displayConfig}
            chartAreaHeight={singleChartHeight ?? "100%"}
            className="h-full min-h-0 w-full"
            drawTool={drawTool}
            drawings={drawingsBySlot[0] ?? []}
            onDrawingsChange={
              onDrawingsChange ? (drawings) => onDrawingsChange(0, drawings) : undefined
            }
            cursorLink={{
              slotIndex: 0,
              onRegister: onRegisterChart,
            }}
          />
        </div>
        {navigator}
      </div>
    );
  }

  const gridClass =
    layoutMode === 2
      ? `grid min-h-0 w-full flex-1 grid-rows-2 gap-2`
      : layoutMode === 3
        ? `grid min-h-0 w-full flex-1 grid-rows-3 gap-2`
        : layoutMode === 4
          ? `grid min-h-0 w-full flex-1 grid-cols-2 grid-rows-2 gap-2`
          : `grid min-h-0 w-full flex-1 grid-cols-2 grid-rows-3 gap-2`;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-hidden">
      <div className={`${gridClass} min-h-0 min-w-0 flex-1 overflow-hidden`}>
        {Array.from({ length: layoutMode }, (_, i) => {
          const slice = sliceForSlot(i);
          return (
            <div
              key={`${layoutMode}-slot-${i}`}
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <MacroChartPanel
                slice={slice}
                compact={compact}
                seriesVisualMap={seriesVisualMap}
                displayConfig={displayConfig}
                className="h-full min-h-0"
                drawTool={drawTool}
                drawings={drawingsBySlot[i] ?? []}
                onDrawingsChange={
                  onDrawingsChange ? (drawings) => onDrawingsChange(i, drawings) : undefined
                }
                cursorLink={
                  slice
                    ? {
                        slotIndex: i,
                        onRegister: onRegisterChart,
                      }
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
      {navigator}
    </div>
  );
}
