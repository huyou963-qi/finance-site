"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EChartsType } from "echarts";
import ReactECharts from "echarts-for-react";
import type { MacroChartSlice } from "@/lib/macroChartOption";
import { macroPayloadToChartOption } from "@/lib/macroChartOption";
import type { MacroChartDisplayConfig, MacroSeriesVisualConfigMap } from "@/lib/macroChartOption";
import type {
  MacroDrawing,
  MacroDrawingDraft,
  MacroDrawingTool,
  MacroPointerData,
} from "@/lib/macroChartDrawing";
import {
  applyMacroChartGraphics,
  pointerToData,
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
  drawTool?: MacroDrawingTool;
  drawings?: MacroDrawing[];
  onDrawingsChange?: (drawings: MacroDrawing[]) => void;
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
  drawTool = "cursor",
  drawings = [],
  onDrawingsChange,
  cursorLink,
}: MacroChartPanelProps) {
  const cursorLinkRef = useRef(cursorLink);
  cursorLinkRef.current = cursorLink;
  const chartRef = useRef<EChartsType | null>(null);
  const drawToolRef = useRef(drawTool);
  const drawingsRef = useRef(drawings);
  const onDrawingsChangeRef = useRef(onDrawingsChange);
  const [draft, setDraft] = useState<MacroDrawingDraft | null>(null);
  const [hoverPoint, setHoverPoint] = useState<MacroPointerData | null>(null);

  drawToolRef.current = drawTool;
  drawingsRef.current = drawings;
  onDrawingsChangeRef.current = onDrawingsChange;

  const categories = slice?.categories ?? [];

  useEffect(() => {
    return () => {
      const cl = cursorLinkRef.current;
      if (cl?.slotIndex !== undefined && cl.onRegister) {
        cl.onRegister(cl.slotIndex, null);
      }
    };
  }, [cursorLink?.slotIndex]);

  useEffect(() => {
    setDraft(null);
    setHoverPoint(null);
  }, [drawTool]);

  const opt = useMemo(
    () =>
      slice?.series?.length
        ? macroPayloadToChartOption(slice, { compact, seriesVisualMap, displayConfig })
        : null,
    [slice, compact, seriesVisualMap, displayConfig],
  );

  const refreshGraphics = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || !categories.length) return;
    applyMacroChartGraphics(chart, categories, drawingsRef.current, draft, hoverPoint);
  }, [categories, draft, hoverPoint]);

  useEffect(() => {
    refreshGraphics();
  }, [refreshGraphics, opt, drawings]);

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
    if (!chart || chart.isDisposed() || !categories.length) return;

    const zr = chart.getZr();

    const onMove = (e: { offsetX?: number; offsetY?: number }) => {
      if (drawToolRef.current !== "trend" && drawToolRef.current !== "rect") {
        setHoverPoint((prev) => (prev ? null : prev));
        return;
      }
      if (e.offsetX == null || e.offsetY == null) return;
      const data = pointerToData(chart, categories, e.offsetX, e.offsetY);
      setHoverPoint(data);
    };

    const onClick = (e: { offsetX?: number; offsetY?: number }) => {
      const tool = drawToolRef.current;
      if (tool === "cursor" || !onDrawingsChangeRef.current) return;
      if (e.offsetX == null || e.offsetY == null) return;
      const data = pointerToData(chart, categories, e.offsetX, e.offsetY);
      if (!data) return;

      if (tool === "hline") {
        onDrawingsChangeRef.current([
          ...drawingsRef.current,
          { id: randomUUID(), kind: "hline", y: data.y },
        ]);
        return;
      }
      if (tool === "vline") {
        onDrawingsChangeRef.current([
          ...drawingsRef.current,
          { id: randomUUID(), kind: "vline", category: data.category },
        ]);
        return;
      }
      if (tool === "text") {
        const text = window.prompt("标注文字", "")?.trim();
        if (!text) return;
        onDrawingsChangeRef.current([
          ...drawingsRef.current,
          { id: randomUUID(), kind: "text", category: data.category, y: data.y, text },
        ]);
        return;
      }
      if (tool === "trend" || tool === "rect") {
        setDraft((prev) => {
          if (!prev || prev.tool !== tool) {
            return { tool, x0: data.category, y0: data.y };
          }
          const nextDrawing: MacroDrawing =
            tool === "trend"
              ? {
                  id: randomUUID(),
                  kind: "trend",
                  x0: prev.x0,
                  y0: prev.y0,
                  x1: data.category,
                  y1: data.y,
                }
              : {
                  id: randomUUID(),
                  kind: "rect",
                  x0: prev.x0,
                  y0: prev.y0,
                  x1: data.category,
                  y1: data.y,
                };
          onDrawingsChangeRef.current?.([...drawingsRef.current, nextDrawing]);
          return null;
        });
      }
    };

    zr.on("mousemove", onMove as never);
    zr.on("click", onClick as never);
    return () => {
      zr.off("mousemove", onMove as never);
      zr.off("click", onClick as never);
    };
  }, [categories, opt]);

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
        className={`flex h-full min-h-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-700/90 bg-slate-950/40 px-2 text-center text-[11px] leading-relaxed text-slate-500 ${className ?? ""}`}
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

  const chartBoxStyle: CSSProperties | undefined = chartAreaHeight
    ? { width: "100%", height: chartAreaHeight, minHeight: chartAreaHeight }
    : undefined;

  const drawingActive = drawTool !== "cursor";

  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${className ?? ""}`}>
      <div
        className={`min-h-0 w-full flex-1 ${chartAreaHeight ? "" : "h-full"} ${drawingActive ? "cursor-crosshair" : ""}`}
        style={chartBoxStyle}
      >
        <ReactECharts
          option={opt!}
          style={{ width: "100%", height: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge
          lazyUpdate
          onChartReady={handleChartReady}
        />
      </div>
    </div>
  );
}
