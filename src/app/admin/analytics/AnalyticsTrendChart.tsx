"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { AnalyticsDailyRow } from "@/lib/analytics/pageView";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const PV_COLOR = "#3987e5";
const UV_COLOR = "#c98500";
const INK_MUTED = "#898781";
const GRID_LINE = "#2c2c2a";
const AXIS_LINE = "#383835";

/** 每日浏览量（柱）+ 访客数（线） */
export function AnalyticsTrendChart({ daily }: { daily: AnalyticsDailyRow[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.setOption({
      grid: { left: 44, right: 16, top: 36, bottom: 28 },
      legend: { top: 0, textStyle: { color: INK_MUTED } },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: daily.map((d) => d.day),
        axisLine: { lineStyle: { color: AXIS_LINE } },
        axisLabel: { color: INK_MUTED, formatter: (v: string) => v.slice(5) },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: INK_MUTED },
        splitLine: { lineStyle: { color: GRID_LINE } },
      },
      series: [
        {
          name: "浏览量 PV",
          type: "bar",
          data: daily.map((d) => d.pv),
          itemStyle: { color: PV_COLOR, opacity: 0.55 },
          barMaxWidth: 18,
        },
        {
          name: "访客 UV",
          type: "line",
          data: daily.map((d) => d.uv),
          itemStyle: { color: UV_COLOR },
          lineStyle: { width: 2 },
          symbolSize: 5,
        },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [daily]);

  return <div ref={ref} className="h-72 w-full" />;
}
