"use client";

/**
 * 美国 CPI 预测页图表：分项贡献横条图、回测（实际柱 + 模型线）。
 * echarts/core 树摇导入，浅色站点配色；身份不只靠颜色（图例 + 数值标签）。
 */
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, DataZoomComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, LineChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

export const GROUP_COLOR: Record<string, string> = {
  能源: "#d9730d",
  食品: "#a37f0d",
  核心商品: "#6940a5",
  核心服务: "#2383e2",
};
const INK = "#1a1a18";
const INK_MUTED = "#6b6b66";
const GRID = "#ececea";
const ACTUAL_BAR = "#c9c9c4";
const MODEL_LINE = "#0b6bcb";
export const CLEVELAND_LINE = "#9b59b6";

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

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? (v > 0 ? "+" : "") + v.toFixed(d) : "—");

export type ContributionItem = {
  label: string;
  group: string;
  /** 百分点 */
  contribution: number;
  prevContribution: number;
};

/** 分项对总体环比的贡献（基点），竖线标记为上月实际贡献 */
export function ContributionChart({ items, prevLabel }: { items: ContributionItem[]; prevLabel: string }) {
  const sorted = useMemo(() => [...items].sort((a, b) => a.contribution - b.contribution), [items]);
  const option = useMemo<echarts.EChartsCoreOption>(
    () => ({
      animation: false,
      grid: { left: 108, right: 56, top: 28, bottom: 28 },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 12,
        itemHeight: 8,
        textStyle: { color: INK_MUTED, fontSize: 12 },
        data: ["本月预测", prevLabel],
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v: unknown) => (typeof v === "number" ? `${fmt(v, 1)} bp` : String(v)),
      },
      xAxis: {
        type: "value",
        axisLabel: { color: INK_MUTED, fontSize: 11, formatter: (v: number) => `${v}` },
        splitLine: { lineStyle: { color: GRID } },
        name: "基点",
        nameTextStyle: { color: INK_MUTED, fontSize: 11 },
      },
      yAxis: {
        type: "category",
        data: sorted.map((i) => i.label),
        axisLabel: { color: INK, fontSize: 12 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: GRID } },
      },
      series: [
        {
          name: "本月预测",
          type: "bar",
          barWidth: "58%",
          data: sorted.map((i) => ({
            value: +(i.contribution * 100).toFixed(2),
            itemStyle: { color: GROUP_COLOR[i.group] ?? MODEL_LINE, borderRadius: 2 },
          })),
          label: {
            show: true,
            position: "right",
            color: INK_MUTED,
            fontSize: 11,
            formatter: (p: { value: number }) => fmt(p.value, 1),
          },
        },
        {
          name: prevLabel,
          type: "scatter",
          symbol: "rect",
          symbolSize: [2, 16],
          itemStyle: { color: INK },
          data: sorted.map((i) => +(i.prevContribution * 100).toFixed(2)),
          z: 5,
        },
      ],
    }),
    [sorted, prevLabel],
  );
  return useChart(option, Math.max(360, sorted.length * 26 + 60));
}

export type BacktestPoint = { month: string; forecast: number; actual: number; cleveland: number | null };

/** 回测：灰柱 = 实际公布环比，蓝线 = 当月 22 日的模型预测，紫色虚线 = 同口径克利夫兰联储 */
export function BacktestChart({ points, height = 280 }: { points: BacktestPoint[]; height?: number }) {
  const hasCleveland = points.some((p) => p.cleveland != null);
  const option = useMemo<echarts.EChartsCoreOption>(
    () => ({
      animation: false,
      grid: { left: 44, right: 16, top: 28, bottom: 56 },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: INK_MUTED, fontSize: 12 },
        data: hasCleveland ? ["实际", "模型预测", "克利夫兰联储"] : ["实际", "模型预测"],
      },
      tooltip: {
        trigger: "axis",
        valueFormatter: (v: unknown) => (typeof v === "number" ? `${v.toFixed(2)}%` : String(v)),
      },
      xAxis: {
        type: "category",
        data: points.map((p) => p.month.slice(0, 7)),
        axisLabel: { color: INK_MUTED, fontSize: 11 },
        axisLine: { lineStyle: { color: GRID } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: INK_MUTED, fontSize: 11, formatter: (v: number) => `${v.toFixed(1)}` },
        splitLine: { lineStyle: { color: GRID } },
      },
      dataZoom: [{ type: "slider", height: 18, bottom: 8, borderColor: GRID }, { type: "inside" }],
      series: [
        {
          name: "实际",
          type: "bar",
          barWidth: "60%",
          itemStyle: { color: ACTUAL_BAR },
          data: points.map((p) => (Number.isFinite(p.actual) ? +p.actual.toFixed(3) : null)),
        },
        {
          name: "模型预测",
          type: "line",
          symbol: "none",
          lineStyle: { color: MODEL_LINE, width: 2 },
          itemStyle: { color: MODEL_LINE },
          data: points.map((p) => (Number.isFinite(p.forecast) ? +p.forecast.toFixed(3) : null)),
          z: 3,
        },
        ...(hasCleveland
          ? [
              {
                name: "克利夫兰联储",
                type: "line",
                symbol: "none",
                connectNulls: false,
                lineStyle: { color: CLEVELAND_LINE, width: 1.5, type: "dashed" },
                itemStyle: { color: CLEVELAND_LINE },
                data: points.map((p) => (p.cleveland != null ? +p.cleveland.toFixed(3) : null)),
                z: 2,
              },
            ]
          : []),
      ],
    }),
    [points, hasCleveland],
  );
  return useChart(option, height);
}
