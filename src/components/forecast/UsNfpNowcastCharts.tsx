"use client";

/**
 * 美国非农预测页图表：回测（首发实际柱 + 模型线 + ADP 点）、SPF 季度对照。
 * echarts/core 树摇导入，浅色站点配色；单位千人。
 */
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, LineChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

const INK_MUTED = "#6b6b66";
const GRID = "#ececea";
const ACTUAL_BAR = "#c9c9c4";
export const MODEL_LINE = "#0b6bcb";
export const ADP_DOT = "#d9730d";
export const SPF_LINE = "#9b59b6";

function useChart(option: echarts.EChartsCoreOption, height: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.setOption(option);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  }, [option]);
  return <div ref={ref} style={{ width: "100%", height }} />;
}

const num = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? Math.round(v) : null);
const valueFmt = (v: unknown) => (typeof v === "number" ? `${Math.round(v)} 千人` : "—");

export type NfpBacktestPoint = { month: string; forecast: number; actual: number; adp: number | null };

/** 灰柱 = 非农首发实际，蓝线 = 同一时点的模型预测，橙点 = ADP 首发（2022-09 起） */
export function NfpBacktestChart({ points }: { points: NfpBacktestPoint[] }) {
  const hasAdp = points.some((p) => p.adp != null);
  const option = useMemo<echarts.EChartsCoreOption>(
    () => ({
      animation: false,
      grid: { left: 52, right: 16, top: 28, bottom: 56 },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: INK_MUTED, fontSize: 12 },
        data: hasAdp ? ["首发实际", "模型预测", "ADP 首发"] : ["首发实际", "模型预测"],
      },
      tooltip: { trigger: "axis", valueFormatter: valueFmt },
      xAxis: {
        type: "category",
        data: points.map((p) => p.month.slice(0, 7)),
        axisLabel: { color: INK_MUTED, fontSize: 11 },
        axisLine: { lineStyle: { color: GRID } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        min: -400,
        max: 800,
        axisLabel: { color: INK_MUTED, fontSize: 11 },
        splitLine: { lineStyle: { color: GRID } },
      },
      dataZoom: [
        { type: "slider", height: 18, bottom: 8, borderColor: GRID, start: 45, end: 100 },
        { type: "inside", start: 45, end: 100 },
      ],
      series: [
        { name: "首发实际", type: "bar", barWidth: "60%", itemStyle: { color: ACTUAL_BAR }, data: points.map((p) => num(p.actual)) },
        {
          name: "模型预测",
          type: "line",
          symbol: "none",
          lineStyle: { color: MODEL_LINE, width: 2 },
          itemStyle: { color: MODEL_LINE },
          data: points.map((p) => num(p.forecast)),
          z: 3,
        },
        ...(hasAdp
          ? [
              {
                name: "ADP 首发",
                type: "scatter",
                symbolSize: 6,
                itemStyle: { color: ADP_DOT },
                data: points.map((p) => num(p.adp)),
                z: 4,
              },
            ]
          : []),
      ],
    }),
    [points, hasAdp],
  );
  return useChart(option, 300);
}

export type SpfRow = { quarter: string; actual: number; spf: number; model: number };

/** 季度平均月增量：实际（首发口径）柱、SPF 中位数虚线、本模型实线 */
export function SpfComparisonChart({ rows }: { rows: SpfRow[] }) {
  const option = useMemo<echarts.EChartsCoreOption>(
    () => ({
      animation: false,
      grid: { left: 52, right: 16, top: 28, bottom: 32 },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: INK_MUTED, fontSize: 12 },
        data: ["实际（季均月增量）", "本模型", "SPF 中位数"],
      },
      tooltip: { trigger: "axis", valueFormatter: valueFmt },
      xAxis: {
        type: "category",
        data: rows.map((r) => r.quarter),
        axisLabel: { color: INK_MUTED, fontSize: 11 },
        axisLine: { lineStyle: { color: GRID } },
        axisTick: { show: false },
      },
      yAxis: { type: "value", axisLabel: { color: INK_MUTED, fontSize: 11 }, splitLine: { lineStyle: { color: GRID } } },
      series: [
        { name: "实际（季均月增量）", type: "bar", barWidth: "55%", itemStyle: { color: ACTUAL_BAR }, data: rows.map((r) => num(r.actual)) },
        {
          name: "本模型",
          type: "line",
          symbol: "circle",
          symbolSize: 4,
          lineStyle: { color: MODEL_LINE, width: 2 },
          itemStyle: { color: MODEL_LINE },
          data: rows.map((r) => num(r.model)),
        },
        {
          name: "SPF 中位数",
          type: "line",
          symbol: "none",
          lineStyle: { color: SPF_LINE, width: 1.5, type: "dashed" },
          itemStyle: { color: SPF_LINE },
          data: rows.map((r) => num(r.spf)),
        },
      ],
    }),
    [rows],
  );
  return useChart(option, 260);
}
