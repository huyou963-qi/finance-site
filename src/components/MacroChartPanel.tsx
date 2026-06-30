"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EChartsType } from "echarts";
import ReactECharts from "echarts-for-react";
import type { MacroChartSlice } from "@/lib/macroChartOption";
import {
  describeSeasonalChartEmptyReason,
  macroPayloadToChartOption,
  macroSliceToPieChartOption,
  macroSliceToSeasonalChartOption,
} from "@/lib/macroChartOption";
import type {
  MacroChartDisplayConfig,
  MacroChartSlotMode,
  MacroSeriesVisualConfigMap,
} from "@/lib/macroChartOption";
import { resolveSlotAxisRanges } from "@/lib/macroChartOption";
import type {
  MacroDrawing,
  MacroDrawingDraft,
  MacroDrawingStyle,
  MacroDrawingTool,
  MacroPointerData,
} from "@/lib/macroChartDrawing";
import {
  applyMacroChartGraphics,
  cloneDrawing,
  DEFAULT_MACRO_DRAWING_STYLE,
  hitTestDrawings,
  moveDrawingByDelta,
  patchDrawing,
  pointerToData,
  pointerToDataForDrag,
  withDefaultStyle,
} from "@/lib/macroChartDrawing";
import { randomUUID } from "@/lib/randomId";

export type MacroChartPanelProps = {
  slice: MacroChartSlice | null;
  compact?: boolean;
  emptyHint?: string;
  className?: string;
  chartAreaHeight?: string;
  seriesVisualMap?: MacroSeriesVisualConfigMap;
  displayConfig?: MacroChartDisplayConfig;
  slotMode?: MacroChartSlotMode;
  slotIndex?: number;
  pieYear?: string | null;
  seasonalYearCount?: number;
  drawTool?: MacroDrawingTool;
  drawStyle?: MacroDrawingStyle;
  drawings?: MacroDrawing[];
  selectedDrawingId?: string | null;
  onDrawingsChange?: (drawings: MacroDrawing[]) => void;
  onSelectDrawing?: (id: string | null) => void;
  onInteraction?: () => void;
  cursorLink?: {
    slotIndex: number;
    onRegister: (slot: number, chart: EChartsType | null) => void;
  };
};

export function MacroChartPanel({
  slice,
  compact,
  emptyHint,
  className,
  chartAreaHeight,
  seriesVisualMap,
  displayConfig,
  slotMode = "timeSeries",
  slotIndex = 0,
  pieYear = null,
  seasonalYearCount = 5,
  drawTool = "cursor",
  drawStyle = DEFAULT_MACRO_DRAWING_STYLE,
  drawings = [],
  selectedDrawingId = null,
  onDrawingsChange,
  onSelectDrawing,
  onInteraction,
  cursorLink,
}: MacroChartPanelProps) {
  const cursorLinkRef = useRef(cursorLink);
  cursorLinkRef.current = cursorLink;
  const chartRef = useRef<EChartsType | null>(null);
  const drawToolRef = useRef(drawTool);
  const drawStyleRef = useRef(drawStyle);
  const drawingsRef = useRef(drawings);
  const selectedIdRef = useRef(selectedDrawingId);
  const onDrawingsChangeRef = useRef(onDrawingsChange);
  const onSelectDrawingRef = useRef(onSelectDrawing);
  const onInteractionRef = useRef(onInteraction);
  const draftRef = useRef<MacroDrawingDraft | null>(null);
  const dragRef = useRef<{
    id: string;
    anchor: MacroPointerData;
    origin: MacroDrawing;
  } | null>(null);
  const [draft, setDraft] = useState<MacroDrawingDraft | null>(null);
  const [hoverPoint, setHoverPoint] = useState<MacroPointerData | null>(null);

  drawToolRef.current = drawTool;
  drawStyleRef.current = drawStyle;
  drawingsRef.current = drawings;
  selectedIdRef.current = selectedDrawingId;
  onDrawingsChangeRef.current = onDrawingsChange;
  onSelectDrawingRef.current = onSelectDrawing;
  onInteractionRef.current = onInteraction;

  const categories = useMemo(
    () => slice?.categories ?? [],
    [slice?.categories],
  );

  useEffect(() => {
    return () => {
      const cl = cursorLinkRef.current;
      if (cl?.slotIndex !== undefined && cl.onRegister) {
        cl.onRegister(cl.slotIndex, null);
      }
    };
  }, [cursorLink?.slotIndex]);

  useEffect(() => {
    draftRef.current = null;
    dragRef.current = null;
    setDraft(null);
    setHoverPoint(null);
  }, [drawTool]);

  const isPie = slotMode === "pie" && Boolean(pieYear);
  const isSeasonal = slotMode === "seasonal";
  const isAltChart = isPie || isSeasonal;

  const axisRanges = useMemo(
    () => resolveSlotAxisRanges(displayConfig, slotIndex),
    [displayConfig, slotIndex],
  );

  const opt = useMemo(() => {
    if (!slice?.series?.length) return null;
    if (isPie && pieYear) {
      return macroSliceToPieChartOption(slice, pieYear, {
        compact,
        seriesVisualMap,
        displayConfig,
      });
    }
    if (isSeasonal) {
      const seasonalSlice: MacroChartSlice = {
        ...slice,
        series: slice.series.slice(0, 1),
      };
      return macroSliceToSeasonalChartOption(seasonalSlice, seasonalYearCount, {
        compact,
        seriesVisualMap,
        displayConfig,
        axisRanges,
      });
    }
    return macroPayloadToChartOption(slice, {
      compact,
      seriesVisualMap,
      displayConfig,
      axisRanges,
    });
  }, [
    slice,
    compact,
    seriesVisualMap,
    displayConfig,
    axisRanges,
    isPie,
    pieYear,
    isSeasonal,
    seasonalYearCount,
  ]);

  const refreshGraphics = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || !categories.length) return;
    applyMacroChartGraphics(
      chart,
      categories,
      drawingsRef.current,
      draft,
      hoverPoint,
      drawStyleRef.current,
      selectedIdRef.current,
    );
  }, [categories, draft, hoverPoint]);

  useEffect(() => {
    refreshGraphics();
  }, [refreshGraphics, opt, drawings, selectedDrawingId, drawStyle]);

  const handleChartReady = useCallback(
    (chart: EChartsType) => {
      chartRef.current = chart;
      if (cursorLink) cursorLink.onRegister(cursorLink.slotIndex, chart);
      requestAnimationFrame(refreshGraphics);
    },
    [cursorLink, refreshGraphics],
  );

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed() || !categories.length || isAltChart) return;

    const zr = chart.getZr();

    const onMove = (e: { offsetX?: number; offsetY?: number }) => {
      if (e.offsetX == null || e.offsetY == null) return;
      const tool = drawToolRef.current;

      if (dragRef.current && tool === "cursor") {
        const data = pointerToDataForDrag(chart, categories, e.offsetX, e.offsetY);
        const drag = dragRef.current;
        const change = onDrawingsChangeRef.current;
        if (data && drag && change) {
          const moved = moveDrawingByDelta(drag.origin, categories, drag.anchor, data);
          change(
            drawingsRef.current.map((d) => (d.id === drag.id ? moved : d)),
          );
        }
        return;
      }

      if (tool !== "trend" && tool !== "rect") {
        setHoverPoint((prev) => (prev ? null : prev));
        return;
      }
      const data = pointerToData(chart, categories, e.offsetX, e.offsetY);
      setHoverPoint(data);
    };

    const onDown = (e: { offsetX?: number; offsetY?: number }) => {
      if (e.offsetX == null || e.offsetY == null) return;
      const tool = drawToolRef.current;
      if (tool !== "cursor") return;

      onInteractionRef.current?.();
      const hitId = hitTestDrawings(chart, categories, drawingsRef.current, e.offsetX, e.offsetY);
      onSelectDrawingRef.current?.(hitId);
      if (hitId) {
        const data = pointerToData(chart, categories, e.offsetX, e.offsetY);
        const origin = drawingsRef.current.find((d) => d.id === hitId);
        if (data && origin) {
          dragRef.current = { id: hitId, anchor: data, origin: cloneDrawing(origin) };
        }
      } else {
        dragRef.current = null;
      }
    };

    const endDrag = () => {
      dragRef.current = null;
    };

    const onClick = (e: { offsetX?: number; offsetY?: number }) => {
      const tool = drawToolRef.current;
      if (e.offsetX == null || e.offsetY == null) return;

      if (tool === "cursor") return;

      if (!onDrawingsChangeRef.current) return;
      onInteractionRef.current?.();

      const data = pointerToData(chart, categories, e.offsetX, e.offsetY);
      if (!data) return;

      const style = drawStyleRef.current;

      if (tool === "hline") {
        const drawing = withDefaultStyle(
          { id: randomUUID(), kind: "hline", y: data.y },
          style,
        );
        onDrawingsChangeRef.current([...drawingsRef.current, drawing]);
        onSelectDrawingRef.current?.(drawing.id);
        return;
      }
      if (tool === "vline") {
        const drawing = withDefaultStyle(
          { id: randomUUID(), kind: "vline", category: data.category },
          style,
        );
        onDrawingsChangeRef.current([...drawingsRef.current, drawing]);
        onSelectDrawingRef.current?.(drawing.id);
        return;
      }
      if (tool === "text") {
        const text = window.prompt("标注文字", "")?.trim();
        if (!text) return;
        const drawing = withDefaultStyle(
          { id: randomUUID(), kind: "text", category: data.category, y: data.y, text },
          style,
        );
        onDrawingsChangeRef.current([...drawingsRef.current, drawing]);
        onSelectDrawingRef.current?.(drawing.id);
        return;
      }
      if (tool === "trend" || tool === "rect") {
        const prev = draftRef.current;
        if (!prev || prev.tool !== tool) {
          const nextDraft: MacroDrawingDraft = {
            tool,
            x0: data.category,
            y0: data.y,
          };
          draftRef.current = nextDraft;
          setDraft(nextDraft);
          return;
        }
        const base =
          tool === "trend"
            ? {
                id: randomUUID(),
                kind: "trend" as const,
                x0: prev.x0,
                y0: prev.y0,
                x1: data.category,
                y1: data.y,
              }
            : {
                id: randomUUID(),
                kind: "rect" as const,
                x0: prev.x0,
                y0: prev.y0,
                x1: data.category,
                y1: data.y,
              };
        const drawing = withDefaultStyle(base, style);
        draftRef.current = null;
        setDraft(null);
        onDrawingsChangeRef.current?.([...drawingsRef.current, drawing]);
        onSelectDrawingRef.current?.(drawing.id);
      }
    };

    const onWindowMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const rect = chart.getDom().getBoundingClientRect();
      onMove({ offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
    };

    zr.on("mousemove", onMove as never);
    zr.on("mousedown", onDown as never);
    zr.on("mouseup", endDrag as never);
    zr.on("click", onClick as never);
    window.addEventListener("mousemove", onWindowMove);
    window.addEventListener("mouseup", endDrag);
    return () => {
      zr.off("mousemove", onMove as never);
      zr.off("mousedown", onDown as never);
      zr.off("mouseup", endDrag as never);
      zr.off("click", onClick as never);
      window.removeEventListener("mousemove", onWindowMove);
      window.removeEventListener("mouseup", endDrag);
    };
  }, [categories, isAltChart, opt]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(refreshGraphics);
    });
    const el = chart.getDom();
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [refreshGraphics, opt]);

  if (!slice?.series?.length) {
    return (
      <div
        className={`flex h-full min-h-0 flex-col items-center justify-center rounded-lg border border-dashed border-fs-border/90 bg-fs-bg/40 px-2 text-center text-[11px] leading-relaxed text-fs-muted ${className ?? ""}`}
      >
        {emptyHint ?? (
          <>
            此图暂无序列
            <br />
            请在左侧勾选指标并选择对应图号
          </>
        )}
      </div>
    );
  }

  if (!opt) {
    return (
      <div
        className={`flex h-full min-h-0 flex-col items-center justify-center rounded-lg border border-dashed border-fs-border/90 bg-fs-bg/40 px-2 text-center text-[11px] leading-relaxed text-fs-muted ${className ?? ""}`}
      >
        {isPie && pieYear
          ? `${pieYear} 年暂无可用数据，请换一年份或检查指标数值`
          : isSeasonal
            ? describeSeasonalChartEmptyReason(
                slice ? { ...slice, series: slice.series.slice(0, 1) } : slice,
                seasonalYearCount,
              )
            : (emptyHint ?? "暂无可用图表数据")}
      </div>
    );
  }

  const chartBoxStyle: CSSProperties | undefined = chartAreaHeight
    ? { width: "100%", height: chartAreaHeight, minHeight: chartAreaHeight }
    : undefined;

  const drawingActive = drawTool !== "cursor";

  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${className ?? ""}`}>
      <div
        className={`min-h-0 w-full flex-1 ${chartAreaHeight ? "" : "h-full"} ${drawingActive ? "cursor-crosshair" : selectedDrawingId ? "cursor-grab" : "cursor-default"}`}
        style={chartBoxStyle}
      >
        <ReactECharts
          option={opt}
          style={{ width: "100%", height: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge
          onChartReady={handleChartReady}
        />
      </div>
    </div>
  );
}

export { patchDrawing };
