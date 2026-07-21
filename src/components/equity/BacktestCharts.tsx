"use client";

/**
 * 回测报告图表（Phase 3 WS4）。echarts/core 树摇导入，与项目既有图表口径一致（暗色）。
 * - NAV 对数曲线 vs SPY：单彩色序列（策略=蓝 #3987e5）+ 灰色基准参照（#898781），
 *   对数 y 轴（几何收益等距）；十字光标 tooltip；图例保证身份非颜色单独承载。
 * - 换手序列：单序列柱（蓝），逐调仓期双边换手率。
 * 颜色取 dataviz 参考实例暗色步进；暗色表面 #1a1a19 系上下文既有约定。
 */

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

const SERIES_BLUE = "#3987e5";
const BENCH_GRAY = "#898781";
const INK_MUTED = "#898781";
const GRID_LINE = "#2c2c2a";
const AXIS_LINE = "#383835";

function useChart(option: echarts.EChartsCoreOption, height: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.setOption(option);
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [option]);
  return <div ref={ref} style={{ width: "100%", height }} />;
}

export type NavPoint = { date: string; nav: number; benchNav: number | null };

/** NAV 对数曲线 vs SPY。nav/benchNav 均起点归一（=1）。 */
export function NavChart({ nav }: { nav: NavPoint[] }) {
  const dates = nav.map((p) => p.date);
  const hasBench = nav.some((p) => p.benchNav != null);
  const option: echarts.EChartsCoreOption = {
    backgroundColor: "transparent",
    animation: false,
    color: [SERIES_BLUE, BENCH_GRAY],
    legend: {
      data: hasBench ? ["策略", "SPY 基准"] : ["策略"],
      textStyle: { color: "#c3c2b7", fontSize: 12 },
      top: 0,
      right: 8,
    },
    grid: { left: 56, right: 20, top: 32, bottom: 48 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a1a19",
      borderColor: AXIS_LINE,
      textStyle: { color: "#ffffff", fontSize: 12 },
      axisPointer: { type: "cross", label: { backgroundColor: "#383835" } },
      valueFormatter: (v: unknown) => (typeof v === "number" ? v.toFixed(3) : String(v)),
    },
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: false,
      axisLabel: { color: INK_MUTED, fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: AXIS_LINE } },
    },
    yAxis: {
      type: "log",
      logBase: 10,
      axisLabel: {
        color: INK_MUTED,
        fontSize: 10,
        formatter: (v: number | string) => `${v}×`,
      },
      splitLine: { lineStyle: { color: GRID_LINE } },
      axisLine: { show: false },
    },
    dataZoom: [
      { type: "inside", start: 0, end: 100 },
      {
        type: "slider",
        height: 16,
        bottom: 16,
        borderColor: AXIS_LINE,
        fillerColor: "rgba(57,135,229,0.12)",
        textStyle: { color: INK_MUTED, fontSize: 9 },
      },
    ],
    series: [
      {
        name: "策略",
        type: "line",
        data: nav.map((p) => p.nav),
        showSymbol: false,
        lineStyle: { width: 2 },
        emphasis: { focus: "series" },
      },
      ...(hasBench
        ? [
            {
              name: "SPY 基准",
              type: "line" as const,
              data: nav.map((p) => p.benchNav),
              showSymbol: false,
              lineStyle: { width: 2, type: "dashed" as const },
              emphasis: { focus: "series" as const },
            },
          ]
        : []),
    ],
  };
  return useChart(option, 320);
}

export type TurnoverPoint = { date: string; turnover: number };

/** 逐调仓期双边换手率柱状。 */
export function TurnoverChart({ points }: { points: TurnoverPoint[] }) {
  const option: echarts.EChartsCoreOption = {
    backgroundColor: "transparent",
    animation: false,
    color: [SERIES_BLUE],
    grid: { left: 48, right: 20, top: 16, bottom: 40 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a1a19",
      borderColor: AXIS_LINE,
      textStyle: { color: "#ffffff", fontSize: 12 },
      valueFormatter: (v: unknown) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : String(v)),
    },
    xAxis: {
      type: "category",
      data: points.map((p) => p.date),
      axisLabel: { color: INK_MUTED, fontSize: 10, hideOverlap: true },
      axisLine: { lineStyle: { color: AXIS_LINE } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: INK_MUTED, fontSize: 10, formatter: (v: number | string) => `${(Number(v) * 100).toFixed(0)}%` },
      splitLine: { lineStyle: { color: GRID_LINE } },
      axisLine: { show: false },
    },
    series: [
      {
        name: "双边换手率",
        type: "bar",
        data: points.map((p) => p.turnover),
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 18,
      },
    ],
  };
  return useChart(option, 180);
}
