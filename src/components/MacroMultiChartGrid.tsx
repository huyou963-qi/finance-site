"use client";

import type { EChartsType } from "echarts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MacroPayload } from "@/lib/data/types";
import { MacroChartPanel } from "@/components/MacroChartPanel";
import { MacroTimeRangeNavigator } from "@/components/MacroTimeRangeNavigator";
import { partitionMacroSeries, type MacroSlotAssignment } from "@/lib/macroPartition";
import type { MacroChartSlice } from "@/lib/macroChartOption";
import {
  isAltMacroSlotMode,
  resolveMacroSlotTitle,
  resolveSlotPieYear,
  resolveSlotRadarYear,
  resolveSlotSeasonalYearCount,
  resolveSlotWaterfallYear,
  type MacroChartDisplayConfig,
  type MacroChartSlotMode,
  type MacroSeriesVisualConfigMap,
} from "@/lib/macroChartOption";
import type {
  MacroDrawing,
  MacroDrawingStyle,
  MacroDrawingTool,
} from "@/lib/macroChartDrawing";
import { DEFAULT_MACRO_DRAWING_STYLE } from "@/lib/macroChartDrawing";
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
  drawStyle?: MacroDrawingStyle;
  drawingsBySlot?: Record<number, MacroDrawing[]>;
  selectedDrawingBySlot?: Record<number, string | null>;
  onDrawingsChange?: (slotIndex: number, drawings: MacroDrawing[]) => void;
  onSelectDrawing?: (slotIndex: number, id: string | null) => void;
  onDrawInteraction?: (slotIndex: number) => void;
  /** 图表十字线当前时间标签（始终回调，供事件联动） */
  onCrosshairTimeLabel?: (timeLabel: string | null) => void;
  /** 底部时间轴当前可见区间标签（始终回调，供事件列表按范围加载） */
  onVisibleRangeLabels?: (payload: {
    fromLabel: string | null;
    toLabel: string | null;
  }) => void;
};

function categoriesOfChart(chart: EChartsType): string[] {
  const raw = chart.getOption()?.xAxis;
  const x0 = Array.isArray(raw) ? raw[0] : raw;
  const data = (x0 as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(data)) return [];
  return data.map((x) => String(x));
}

function numericFromDataItem(raw: unknown): number | null {
  let v: unknown = raw;
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    v = (v as { value?: unknown }).value;
  }
  if (Array.isArray(v)) v = v[v.length - 1];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * 选一个在该下标处「有有效数值」的系列索引用于 showTip 锚点。
 * 直接用 seriesIndex:0 时，若 0 号系列在该日期为空（如某条更短的指标线），tooltip 没有锚点就不会弹出，
 * 而该图其它系列其实有值。这里优先找有值的系列，找不到再退回 0。
 */
function anchorSeriesIndexAt(chart: EChartsType, dataIndex: number): number {
  const opt = chart.getOption() as { series?: Array<{ data?: unknown[] }> } | undefined;
  const series = opt?.series;
  if (!Array.isArray(series) || series.length === 0) return -1;
  for (let i = 0; i < series.length; i++) {
    const d = series[i]?.data;
    if (!Array.isArray(d) || dataIndex < 0 || dataIndex >= d.length) continue;
    if (numericFromDataItem(d[dataIndex]) !== null) return i;
  }
  const first = series[0]?.data;
  if (Array.isArray(first) && dataIndex >= 0 && dataIndex < first.length) return 0;
  return -1;
}

function dispatchCrosshairTip(chart: EChartsType, dataIndex: number) {
  if (chart.isDisposed() || dataIndex < 0) return;
  const cats = categoriesOfChart(chart);
  if (dataIndex >= cats.length) return;
  try {
    chart.dispatchAction({
      type: "updateAxisPointer",
      currTrigger: "mousemove",
      xAxisIndex: 0,
      dataIndex,
    });
  } catch {
    return;
  }
  const seriesIndex = anchorSeriesIndexAt(chart, dataIndex);
  if (seriesIndex < 0) return;
  try {
    chart.dispatchAction({ type: "showTip", seriesIndex, dataIndex });
  } catch {
    /* 系列/下标未就绪时忽略，避免 getRawIndex 运行时错误 */
  }
}

/**
 * 把不同频率的时间标签解析为可比较的 UTC 毫秒：
 * 支持 年(YYYY)、季度(YYYY-Q1)、月(YYYY-MM)、日(YYYY-MM-DD)，及可被 Date.parse 识别的其它写法。
 */
function timeLabelToMs(label: string): number {
  const s = label.trim();
  if (/^\d{4}$/.test(s)) return Date.UTC(Number(s), 0, 1);
  const q = /^(\d{4})[-/]?Q([1-4])$/i.exec(s);
  if (q) return Date.UTC(Number(q[1]), (Number(q[2]) - 1) * 3, 1);
  if (/^\d{4}-\d{2}$/.test(s)) {
    return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : Number.NaN;
}

/**
 * 在目标图的类目里，为给定时间标签找到对应下标，跨频率对齐：
 * 优先精确匹配；否则优先选「包含该时间的周期」（即 ≤ target 的最近类目，例如日频 3-15 → 月频 3 月、年频 2024）；
 * 若 target 早于全部类目，则回退到时间上最接近的类目。
 */
function indexForTimeLabel(cats: string[], label: string | null): number {
  if (!label || cats.length === 0) return -1;
  const exact = cats.findIndex((x) => x === label);
  if (exact >= 0) return exact;
  const target = timeLabelToMs(label);
  if (!Number.isFinite(target)) return -1;
  let floorIdx = -1;
  let floorDelta = Number.POSITIVE_INFINITY;
  let nearestIdx = -1;
  let nearestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cats.length; i++) {
    const t = timeLabelToMs(cats[i] ?? "");
    if (!Number.isFinite(t)) continue;
    const abs = Math.abs(t - target);
    if (abs < nearestDelta) {
      nearestDelta = abs;
      nearestIdx = i;
    }
    if (t <= target) {
      const d = target - t;
      if (d < floorDelta) {
        floorDelta = d;
        floorIdx = i;
      }
    }
  }
  return floorIdx >= 0 ? floorIdx : nearestIdx;
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
  drawStyle = DEFAULT_MACRO_DRAWING_STYLE,
  drawingsBySlot = {},
  selectedDrawingBySlot = {},
  onDrawingsChange,
  onSelectDrawing,
  onDrawInteraction,
  onCrosshairTimeLabel,
  onVisibleRangeLabels,
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

  const onLocalCrosshairRef = useRef(onLocalCrosshairTimeLabel);
  const onCrosshairTimeLabelRef = useRef(onCrosshairTimeLabel);
  const onVisibleRangeLabelsRef = useRef(onVisibleRangeLabels);
  const onLocalVisibleRangeRef = useRef(onLocalVisibleRange);
  const pageSyncEnabledRef = useRef(pageSyncEnabled);
  /** 最近一次「应用远端时间轴」后写入的 rangePct，用于识别并丢弃由此引发的回环广播 */
  const lastAppliedRemoteRangeRef = useRef<{ start: number; end: number } | null>(null);
  useEffect(() => {
    onLocalCrosshairRef.current = onLocalCrosshairTimeLabel;
  }, [onLocalCrosshairTimeLabel]);
  useEffect(() => {
    onCrosshairTimeLabelRef.current = onCrosshairTimeLabel;
  }, [onCrosshairTimeLabel]);
  useEffect(() => {
    onVisibleRangeLabelsRef.current = onVisibleRangeLabels;
  }, [onVisibleRangeLabels]);
  useEffect(() => {
    onLocalVisibleRangeRef.current = onLocalVisibleRange;
  }, [onLocalVisibleRange]);

  useEffect(() => {
    const len = payload.categories.length;
    if (len === 0) {
      onVisibleRangeLabelsRef.current?.({ fromLabel: null, toLabel: null });
      return;
    }
    const { i0, i1 } = indicesFromDataZoomPct(rangePct.start, rangePct.end, len);
    onVisibleRangeLabelsRef.current?.({
      fromLabel: payload.categories[i0] ?? null,
      toLabel: payload.categories[i1] ?? null,
    });
  }, [rangePct.start, rangePct.end, payload.categories, categoriesFingerprint]);
  useEffect(() => {
    pageSyncEnabledRef.current = pageSyncEnabled;
  }, [pageSyncEnabled]);

  /** 键盘 ←/→ 单步调节十字线所需的「单一真相」与模式状态 */
  const activeIndexRef = useRef<number | null>(null);
  const keyboardLockedRef = useRef(false);
  const hoveredChartRef = useRef<EChartsType | null>(null);
  const lastMousePixelRef = useRef<{ x: number; y: number } | null>(null);
  const drawToolRef = useRef(drawTool);
  useEffect(() => {
    drawToolRef.current = drawTool;
  }, [drawTool]);

  const broadcastVisibleRange = useCallback(
    (next: { start: number; end: number }) => {
      if (!pageSyncEnabledRef.current || !onLocalVisibleRangeRef.current) return;
      const len = payload.categories.length;
      if (len === 0) return;
      const { i0: fromIdx, i1: toIdx } = indicesFromDataZoomPct(next.start, next.end, len);
      onLocalVisibleRangeRef.current({
        startPct: next.start,
        endPct: next.end,
        fromLabel: payload.categories[fromIdx] ?? null,
        toLabel: payload.categories[toIdx] ?? null,
      });
    },
    [payload.categories],
  );

  /** 本地拖拽底部时间轴：仅更新区间状态；广播交由下方 effect 统一处理（带数值防回环） */
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

  /**
   * 区间变化后广播给其它页面。用「数值比对」防回环：
   * 当本地 rangePct 等于刚刚应用的远端区间时跳过广播（被动方应用后不再反向广播回来），
   * 用户真正拖出的新区间则正常广播——双向同步可靠，且不会 A→B→A 来回循环。
   */
  useEffect(() => {
    if (!pageSyncEnabled) return;
    const applied = lastAppliedRemoteRangeRef.current;
    if (
      applied &&
      Math.abs(applied.start - rangePct.start) < 0.2 &&
      Math.abs(applied.end - rangePct.end) < 0.2
    ) {
      return;
    }
    broadcastVisibleRange(rangePct);
  }, [pageSyncEnabled, rangePct, broadcastVisibleRange]);

  const chartSlots = useRef<(EChartsType | null)[]>([null, null, null, null, null, null]);
  const [registerRev, setRegisterRev] = useState(0);

  const onRegisterChart = useCallback((slot: number, chart: EChartsType | null) => {
    if (chartSlots.current[slot] === chart) return;
    chartSlots.current[slot] = chart;
    setRegisterRev((r) => r + 1);
  }, []);

  const slotModeFor = useCallback(
    (slot: number): MacroChartSlotMode => displayConfig?.slotModes?.[slot] ?? "timeSeries",
    [displayConfig?.slotModes],
  );

  const sliceForSlot = useCallback(
    (index: number): MacroChartSlice | null => {
      const series = buckets[index] ?? [];
      if (series.length === 0) return null;
      const slotTitle = resolveMacroSlotTitle(index, layoutMode, displayConfig, {
        seriesLabel: series[0]?.name,
      });
      const mode = slotModeFor(index);
      if (isAltMacroSlotMode(mode)) {
        return {
          categories: payload.categories,
          series: mode === "seasonal" ? series.slice(0, 1) : series,
          title: slotTitle,
        };
      }
      const slicedSeries = series.map((s) => ({
        ...s,
        data: s.data.slice(i0, i1 + 1),
      }));
      return {
        categories: visibleCategories,
        series: slicedSeries,
        title: slotTitle,
      };
    },
    [
      buckets,
      displayConfig,
      i0,
      i1,
      layoutMode,
      payload.categories,
      slotModeFor,
      visibleCategories,
    ],
  );

  const pieYearForSlot = useCallback(
    (slot: number): string | null => {
      if (slotModeFor(slot) !== "pie") return null;
      return resolveSlotPieYear(payload.categories, displayConfig?.slotPieYears, slot);
    },
    [displayConfig?.slotPieYears, payload.categories, slotModeFor],
  );

  const waterfallYearForSlot = useCallback(
    (slot: number): string | null => {
      if (slotModeFor(slot) !== "waterfall") return null;
      return resolveSlotWaterfallYear(payload.categories, displayConfig?.slotWaterfallYears, slot);
    },
    [displayConfig?.slotWaterfallYears, payload.categories, slotModeFor],
  );

  const radarYearForSlot = useCallback(
    (slot: number): string | null => {
      if (slotModeFor(slot) !== "radar") return null;
      return resolveSlotRadarYear(payload.categories, displayConfig?.slotRadarYears, slot);
    },
    [displayConfig?.slotRadarYears, payload.categories, slotModeFor],
  );

  const seasonalYearCountForSlot = useCallback(
    (slot: number): number => {
      if (slotModeFor(slot) !== "seasonal") return 5;
      return resolveSlotSeasonalYearCount(displayConfig?.slotSeasonalYearCount, slot);
    },
    [displayConfig?.slotSeasonalYearCount, slotModeFor],
  );

  const isAltSlotMode = useCallback(
    (slot: number) => isAltMacroSlotMode(slotModeFor(slot)),
    [slotModeFor],
  );

  useEffect(() => {
    const charts: EChartsType[] = [];
    for (let s = 0; s < layoutMode; s++) {
      if (isAltSlotMode(s)) continue;
      const c = chartSlots.current[s];
      if (c && !c.isDisposed()) charts.push(c);
    }
    if (charts.length < 1) return undefined;

    const categories = visibleCategories;
    let linking = false;

    // 类目变化（数据/缩放）后重置选中态，避免沿用过期下标
    activeIndexRef.current = null;
    keyboardLockedRef.current = false;
    hoveredChartRef.current = null;

    const cleanups: (() => void)[] = [];

    const showTipAt = (chart: EChartsType, idx: number) => {
      dispatchCrosshairTip(chart, idx);
    };

    /** 将选中下标应用到来源图（可选）与其它图，并按需广播 */
    const applyActiveIndex = (
      sourceIdx: number,
      index: number,
      includeSource: boolean,
    ) => {
      const len = categories.length;
      if (len === 0) return;
      const clamped = Math.max(0, Math.min(len - 1, index));
      activeIndexRef.current = clamped;
      const timeLabel = categories[clamped] ?? null;
      if (!timeLabel) return;

      if (includeSource) {
        const src = charts[sourceIdx];
        if (src && !src.isDisposed()) showTipAt(src, clamped);
      }
      charts.forEach((target, ti) => {
        if (ti === sourceIdx || target.isDisposed()) return;
        const targetCats = categoriesOfChart(target);
        const targetIdx = indexForTimeLabel(targetCats, timeLabel);
        if (targetIdx < 0) return;
        showTipAt(target, targetIdx);
      });
      if (pageSyncEnabledRef.current) {
        onLocalCrosshairRef.current?.(timeLabel);
      }
      onCrosshairTimeLabelRef.current?.(timeLabel);
    };

    const hideAll = () => {
      charts.forEach((c) => {
        if (!c.isDisposed()) c.dispatchAction({ type: "hideTip" });
      });
      hoveredChartRef.current = null;
      keyboardLockedRef.current = false;
      if (pageSyncEnabledRef.current) {
        onLocalCrosshairRef.current?.(null);
      }
      onCrosshairTimeLabelRef.current?.(null);
    };

    charts.forEach((source, si) => {
      const zr = source.getZr();
      let raf = 0;

      const onMove = (e: { offsetX?: number; offsetY?: number }) => {
        if (linking) return;
        const ox = e.offsetX ?? 0;
        const oy = e.offsetY ?? 0;

        // 真实位移检测：键控期间忽略微小抖动，鼠标真的移动了才切回 hover 模式
        const last = lastMousePixelRef.current;
        const moved = !last || Math.abs(last.x - ox) + Math.abs(last.y - oy) > 2;
        lastMousePixelRef.current = { x: ox, y: oy };
        if (keyboardLockedRef.current) {
          if (!moved) return;
          keyboardLockedRef.current = false;
        }
        hoveredChartRef.current = source;

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
          activeIndexRef.current = dataIndex;
          const timeLabel = categories[dataIndex] ?? null;
          if (!timeLabel) return;

          if (pageSyncEnabledRef.current) {
            onLocalCrosshairRef.current?.(timeLabel);
          }
          onCrosshairTimeLabelRef.current?.(timeLabel);

          if (charts.length < 2) return;

          linking = true;
          try {
            charts.forEach((target, ti) => {
              if (ti === si || target.isDisposed()) return;
              const targetCats = categoriesOfChart(target);
              const targetIdx = indexForTimeLabel(targetCats, timeLabel);
              if (targetIdx < 0) return;
              showTipAt(target, targetIdx);
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

    // 键盘 ←/→ 单步：作用于「鼠标当前所在的图」，键控时锁定、忽略鼠标，直到鼠标真正移动再解锁
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      if (drawToolRef.current !== "cursor") return;
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const source = hoveredChartRef.current;
      if (!source || source.isDisposed()) return;
      const si = charts.indexOf(source);
      if (si < 0) return;
      const len = categories.length;
      if (len === 0) return;

      ev.preventDefault();
      const base = activeIndexRef.current ?? 0;
      const next = ev.key === "ArrowRight" ? base + 1 : base - 1;
      keyboardLockedRef.current = true;
      applyActiveIndex(si, next, true);
    };
    window.addEventListener("keydown", onKeyDown);
    cleanups.push(() => window.removeEventListener("keydown", onKeyDown));

    return () => {
      cleanups.forEach((fn) => fn());
    };
    }, [layoutMode, registerRev, isAltSlotMode, visibleCategories]);

  useEffect(() => {
    if (!pageSyncEnabled || !remoteCrosshairVersion) return;
    const charts: EChartsType[] = [];
    for (let s = 0; s < layoutMode; s++) {
      if (isAltSlotMode(s)) continue;
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
      dispatchCrosshairTip(target, idx);
    });
  }, [
    layoutMode,
    pageSyncEnabled,
    registerRev,
    remoteCrosshairTimeLabel,
    remoteCrosshairVersion,
    slotModeFor,
    isAltSlotMode,
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

    // 记录本次应用的区间：导航条若因程序化更新而回调 onRangePctChange，可据此识别并丢弃回声，不再反向广播
    lastAppliedRemoteRangeRef.current = { start: nextStart, end: nextEnd };
    setRangePct((prev) => {
      if (
        Math.abs(prev.start - nextStart) < 0.1 &&
        Math.abs(prev.end - nextEnd) < 0.1
      ) {
        return prev;
      }
      return { start: nextStart, end: nextEnd };
    });
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
            slotMode={slotModeFor(0)}
            slotIndex={0}
            pieYear={pieYearForSlot(0)}
            waterfallYear={waterfallYearForSlot(0)}
            radarYear={radarYearForSlot(0)}
            seasonalYearCount={seasonalYearCountForSlot(0)}
            chartAreaHeight={singleChartHeight ?? "100%"}
            className="h-full min-h-0 w-full"
            drawTool={isAltSlotMode(0) ? "cursor" : drawTool}
            drawStyle={drawStyle}
            drawings={isAltSlotMode(0) ? [] : (drawingsBySlot[0] ?? [])}
            selectedDrawingId={isAltSlotMode(0) ? null : (selectedDrawingBySlot[0] ?? null)}
            onDrawingsChange={
              isAltSlotMode(0) || !onDrawingsChange
                ? undefined
                : (drawings) => onDrawingsChange(0, drawings)
            }
            onSelectDrawing={
              isAltSlotMode(0) || !onSelectDrawing
                ? undefined
                : (id) => onSelectDrawing(0, id)
            }
            onInteraction={
              isAltSlotMode(0) || !onDrawInteraction ? undefined : () => onDrawInteraction(0)
            }
            cursorLink={
              isAltSlotMode(0)
                ? undefined
                : {
                    slotIndex: 0,
                    onRegister: onRegisterChart,
                  }
            }
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
          const mode = slotModeFor(i);
          const isAlt = isAltSlotMode(i);
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
                slotMode={mode}
                slotIndex={i}
                pieYear={pieYearForSlot(i)}
                waterfallYear={waterfallYearForSlot(i)}
                radarYear={radarYearForSlot(i)}
                seasonalYearCount={seasonalYearCountForSlot(i)}
                className="h-full min-h-0"
                drawTool={isAlt ? "cursor" : drawTool}
                drawStyle={drawStyle}
                drawings={isAlt ? [] : (drawingsBySlot[i] ?? [])}
                selectedDrawingId={isAlt ? null : (selectedDrawingBySlot[i] ?? null)}
                onDrawingsChange={
                  isAlt || !onDrawingsChange
                    ? undefined
                    : (drawings) => onDrawingsChange(i, drawings)
                }
                onSelectDrawing={
                  isAlt || !onSelectDrawing ? undefined : (id) => onSelectDrawing(i, id)
                }
                onInteraction={
                  isAlt || !onDrawInteraction ? undefined : () => onDrawInteraction(i)
                }
                cursorLink={
                  slice && !isAlt
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
