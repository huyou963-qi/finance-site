"use client";

/**
 * 因子研究图表（Phase 4 WS5）。echarts/core 树摇导入，暗色，口径同 BacktestCharts。
 * - 累计 IC 曲线：多因子多序列（分类 8 色，legend 保证身份非颜色单独承载）。
 * - 五分层柱：单因子各分位组次期等权收益，单蓝色（高度即量级，x 轴即分位序）。
 * 相关/分 regime 热力图用 HTML 表格（见 client），非 echarts。
 */

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

// dataviz 暗色分类 8 色（文档顺序，line/adjacent 全通过）
const CATEGORICAL = [
  "#3987e5",
  "#008300",
  "#d55181",
  "#c98500",
  "#199e70",
  "#d95926",
  "#9085e9",
  "#e66767",
];
const SERIES_BLUE = "#3987e5";
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

export type CumulativeICSeries = { name: string; dates: string[]; cumIC: number[] };

/** 多因子累计 IC 曲线（每因子一条，legend 标识） */
export function CumulativeICChart({ series }: { series: CumulativeICSeries[] }) {
  const dates = series[0]?.dates ?? [];
  const option: echarts.EChartsCoreOption = {
    backgroundColor: "transparent",
    animation: false,
    color: CATEGORICAL,
    legend: {
      data: series.map((s) => s.name),
      textStyle: { color: "#c3c2b7", fontSize: 12 },
      top: 0,
      type: "scroll",
    },
    grid: { left: 52, right: 20, top: 32, bottom: 40 },
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
      type: "value",
      name: "累计 IC",
      nameTextStyle: { color: INK_MUTED, fontSize: 10 },
      axisLabel: { color: INK_MUTED, fontSize: 10 },
      splitLine: { lineStyle: { color: GRID_LINE } },
      axisLine: { show: false },
    },
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      data: s.cumIC,
      showSymbol: false,
      lineStyle: { width: 2 },
      emphasis: { focus: "series" },
    })),
  };
  return useChart(option, 300);
}

/** 五分层柱：各分位组次期等权收益（低→高因子值）。单蓝色。 */
export function QuantileBarChart({
  groupReturns,
  quantiles,
}: {
  groupReturns: (number | null)[];
  quantiles: number;
}) {
  const labels = Array.from({ length: quantiles }, (_, i) =>
    i === 0 ? `Q1（最低）` : i === quantiles - 1 ? `Q${quantiles}（最高）` : `Q${i + 1}`,
  );
  const option: echarts.EChartsCoreOption = {
    backgroundColor: "transparent",
    animation: false,
    color: [SERIES_BLUE],
    grid: { left: 52, right: 20, top: 16, bottom: 32 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a1a19",
      borderColor: AXIS_LINE,
      textStyle: { color: "#ffffff", fontSize: 12 },
      valueFormatter: (v: unknown) =>
        typeof v === "number" ? `${(v * 100).toFixed(2)}%` : String(v),
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { color: INK_MUTED, fontSize: 10 },
      axisLine: { lineStyle: { color: AXIS_LINE } },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: INK_MUTED,
        fontSize: 10,
        formatter: (v: number | string) => `${(Number(v) * 100).toFixed(1)}%`,
      },
      splitLine: { lineStyle: { color: GRID_LINE } },
      axisLine: { show: false },
    },
    series: [
      {
        name: "分位组次期等权收益",
        type: "bar",
        data: groupReturns.map((v) => (v == null ? null : v)),
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 48,
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: AXIS_LINE, type: "dashed" },
          data: [{ yAxis: 0 }],
        },
      },
    ],
  };
  return useChart(option, 220);
}
