"use client";

/**
 * 美国 GDP Now 回测图：首发实际柱、模型线、亚特兰大联储 GDPNow 虚线。单位为季度环比折年率 %。
 */
import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

const INK_MUTED = "#6b6b66";
const GRID = "#ececea";
const ACTUAL_BAR = "#c9c9c4";
export const MODEL_LINE = "#0b6bcb";
export const GDPNOW_LINE = "#d9730d";

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

const num = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const valueFmt = (v: unknown) => (typeof v === "number" ? `${v.toFixed(2)}%` : "—");

export type GdpBacktestPoint = { quarter: string; forecast: number; actual: number; gdpNow: number | null };

export function GdpBacktestChart({ points }: { points: GdpBacktestPoint[] }) {
  const hasNow = points.some((p) => p.gdpNow != null);
  const option = useMemo<echarts.EChartsCoreOption>(
    () => ({
      animation: false,
      grid: { left: 48, right: 16, top: 28, bottom: 56 },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: INK_MUTED, fontSize: 12 },
        data: hasNow ? ["首发实际", "模型预测", "GDPNow"] : ["首发实际", "模型预测"],
      },
      tooltip: { trigger: "axis", valueFormatter: valueFmt },
      xAxis: {
        type: "category",
        data: points.map((p) => p.quarter),
        axisLabel: { color: INK_MUTED, fontSize: 11 },
        axisLine: { lineStyle: { color: GRID } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: INK_MUTED, fontSize: 11, formatter: "{value}%" },
        splitLine: { lineStyle: { color: GRID } },
      },
      dataZoom: [
        { type: "slider", height: 18, bottom: 8, borderColor: GRID, start: 55, end: 100 },
        { type: "inside", start: 55, end: 100 },
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
        ...(hasNow
          ? [
              {
                name: "GDPNow",
                type: "line",
                symbol: "none",
                lineStyle: { color: GDPNOW_LINE, width: 1.5, type: "dashed" },
                itemStyle: { color: GDPNOW_LINE },
                data: points.map((p) => num(p.gdpNow)),
                z: 2,
              },
            ]
          : []),
      ],
    }),
    [points, hasNow],
  );
  return useChart(option, 320);
}
