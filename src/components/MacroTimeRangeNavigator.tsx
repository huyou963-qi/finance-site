"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";

export type MacroTimeRangeNavigatorProps = {
  categories: string[];
  /** 概览折线，一般取某条序列；长度与 categories 一致时可读性最好 */
  previewData: (number | null)[];
  /** 0–100，与 ECharts dataZoom 一致 */
  rangePct: { start: number; end: number };
  onRangePctChange: (next: { start: number; end: number }) => void;
  className?: string;
};

function extractDataZoomRange(params: unknown): { start: number; end: number } | null {
  if (params == null || typeof params !== "object") return null;
  const o = params as Record<string, unknown>;
  if (typeof o.start === "number" && typeof o.end === "number") {
    return { start: o.start, end: o.end };
  }
  const batch = o.batch;
  if (Array.isArray(batch) && batch.length > 0) {
    const b = batch[0] as Record<string, unknown>;
    if (typeof b.start === "number" && typeof b.end === "number") {
      return { start: b.start, end: b.end };
    }
  }
  return null;
}

/**
 * 图表下方时间范围导航：dataZoom 滑块 + 全量时间轴预览；拖动两端或平移选中区。
 * 父组件根据 rangePct 自行切片各序列数据。
 */
export function MacroTimeRangeNavigator({
  categories,
  previewData,
  rangePct,
  onRangePctChange,
  className,
}: MacroTimeRangeNavigatorProps) {
  const alignedPreview = useMemo(() => {
    const n = categories.length;
    if (n === 0) return [];
    if (previewData.length === n) {
      return previewData.map((v) => (v == null ? null : v));
    }
    return Array.from({ length: n }, (_, i) => previewData[i] ?? null);
  }, [categories, previewData]);

  const longMonthlyAxis = useMemo(
    () =>
      categories.length > 48 &&
      /^\d{4}-\d{2}$/.test(categories[0] ?? "") &&
      /^\d{4}-\d{2}$/.test(categories[categories.length - 1] ?? ""),
    [categories],
  );
  const monthAxisLabelInterval = longMonthlyAxis
    ? Math.max(1, Math.floor(categories.length / 18))
    : undefined;

  const option = useMemo((): EChartsOption => {
    const n = categories.length;
    return {
      animation: false,
      backgroundColor: "transparent",
      textStyle: { color: "#94a3b8" },
      grid: { left: 52, right: 20, top: 10, bottom: 28 },
      xAxis: {
        type: "category",
        data: categories,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#334155" } },
        axisTick: { alignWithLabel: true },
        axisLabel: {
          color: "#64748b",
          fontSize: 10,
          ...(monthAxisLabelInterval !== undefined ? { interval: monthAxisLabelInterval } : {}),
        },
      },
      yAxis: {
        type: "value",
        show: false,
        scale: true,
      },
      series:
        n === 0
          ? []
          : [
              {
                name: "overview",
                type: "line",
                data: alignedPreview,
                showSymbol: false,
                smooth: true,
                connectNulls: true,
                lineStyle: { color: "#475569", width: 1 },
                areaStyle: { color: "rgba(71,85,105,0.22)" },
              },
            ],
      dataZoom: [
        {
          type: "slider",
          xAxisIndex: 0,
          start: rangePct.start,
          end: rangePct.end,
          height: 22,
          bottom: 4,
          borderColor: "#334155",
          backgroundColor: "rgba(15,23,42,0.6)",
          fillerColor: "rgba(16,185,129,0.28)",
          borderRadius: 2,
          handleStyle: {
            color: "#f8fafc",
            borderColor: "#64748b",
          },
          moveHandleSize: 5,
          emphasis: {
            handleStyle: { borderColor: "#34d399" },
          },
          textStyle: { color: "#64748b", fontSize: 10 },
          brushSelect: false,
          showDetail: false,
        },
      ],
    };
  }, [categories, alignedPreview, rangePct.start, rangePct.end, monthAxisLabelInterval]);

  if (categories.length === 0) {
    return null;
  }

  return (
    <div
      className={`shrink-0 ${className ?? ""}`}
      style={{ minHeight: 88, height: 88, width: "100%" }}
    >
      <ReactECharts
        option={option}
        style={{ width: "100%", height: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge={false}
        lazyUpdate
        onEvents={{
          dataZoom: (p: unknown) => {
            const r = extractDataZoomRange(p);
            if (r) onRangePctChange({ start: r.start, end: r.end });
          },
        }}
      />
    </div>
  );
}
