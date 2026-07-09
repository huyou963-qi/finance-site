"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

type NavSeries = { name: string; data: { time: number; value: number }[] };

export function SectorNavChart({
  series,
  height = 280,
}: {
  series: NavSeries[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const option = useMemo(() => {
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      legend: {
        type: "scroll",
        textStyle: { color: "#9da8b6", fontSize: 11 },
        top: 0,
      },
      grid: { left: 48, right: 16, top: 36, bottom: 28 },
      xAxis: {
        type: "time",
        axisLabel: { color: "#9da8b6", fontSize: 10 },
        axisLine: { lineStyle: { color: "#2a3340" } },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: "#9da8b6", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1e2630" } },
      },
      series: series.map((s) => ({
        name: s.name,
        type: "line",
        showSymbol: false,
        data: s.data.map((p) => [p.time * 1000, p.value]),
      })),
    };
  }, [series]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
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

export function StyleBarChart({
  rows,
  height = 160,
}: {
  rows: { name: string; excess: number | null }[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      grid: { left: 56, right: 16, top: 12, bottom: 28 },
      xAxis: {
        type: "category",
        data: rows.map((r) => r.name),
        axisLabel: { color: "#9da8b6" },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          color: "#9da8b6",
          formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
        },
        splitLine: { lineStyle: { color: "#1e2630" } },
      },
      series: [
        {
          type: "bar",
          data: rows.map((r) => ({
            value: r.excess ?? 0,
            itemStyle: {
              color: (r.excess ?? 0) >= 0 ? "#3ecf8e" : "#ef6461",
            },
          })),
          barWidth: 36,
        },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [rows]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
