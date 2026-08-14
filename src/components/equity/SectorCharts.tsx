"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

type NavSeries = { name: string; data: { time: number; value: number }[] };

export function SectorNavChart({
  series,
  height = 280,
  showDataZoom = false,
  zoomWindow = null,
}: {
  series: NavSeries[];
  height?: number;
  /** 历史研究主图显示可拖拽缩放轴；普通短期净值图保持紧凑。 */
  showDataZoom?: boolean;
  /** 阶段卡被选中时，缩放轴聚焦该阶段；null = 展示完整历史。 */
  zoomWindow?: { start: string; end: string } | null;
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
      grid: { left: 48, right: 16, top: 36, bottom: showDataZoom ? 66 : 28 },
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
      dataZoom: showDataZoom
        ? [
            {
              type: "slider",
              height: 18,
              bottom: 18,
              borderColor: "#2a3340",
              backgroundColor: "rgba(30, 38, 48, 0.5)",
              fillerColor: "rgba(62, 207, 142, 0.16)",
              handleStyle: { color: "#3ecf8e", borderColor: "#3ecf8e" },
              textStyle: { color: "#9da8b6", fontSize: 10 },
              ...(zoomWindow
                ? { startValue: zoomWindow.start, endValue: zoomWindow.end }
                : { start: 0, end: 100 }),
            },
            zoomWindow
              ? { type: "inside", startValue: zoomWindow.start, endValue: zoomWindow.end }
              : { type: "inside", start: 0, end: 100 },
          ]
        : undefined,
      series: series.map((s) => ({
        name: s.name,
        type: "line",
        showSymbol: false,
        data: s.data.map((p) => [p.time * 1000, p.value]),
      })),
    };
  }, [series, showDataZoom, zoomWindow]);

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
