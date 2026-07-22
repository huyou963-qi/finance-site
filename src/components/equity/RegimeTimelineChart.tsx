"use client";

/**
 * regime 时间线（Phase 4 WS5）：增长维 z 与通胀动量 z 双线（同一 z 轴，非双轴），
 * 背景 markArea 按四象限着色（regime 身份靠色带 + 悬浮 tooltip 文本，非颜色单独承载）。
 * NBER 衰退月用底部标记条对照（recession=1）。
 */

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkAreaComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { REGIME_COLOR, REGIME_LABEL, type RegimeKey } from "@/components/equity/regimeVisuals";

echarts.use([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkAreaComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

const GROWTH_LINE = "#3987e5";
const INFL_LINE = "#c98500";
const INK_MUTED = "#898781";
const GRID_LINE = "#2c2c2a";
const AXIS_LINE = "#383835";

export type RegimePoint = {
  date: string;
  regime: RegimeKey;
  recession: number;
  growthZ: number | null;
  inflationMomZ: number | null;
};

/** 连续同 regime 段压成 markArea 区间（category 轴用起止标签对） */
function regimeBands(points: RegimePoint[]) {
  const bands: { start: string; end: string; regime: RegimeKey }[] = [];
  let i = 0;
  while (i < points.length) {
    const r = points[i]!.regime;
    let j = i;
    while (j + 1 < points.length && points[j + 1]!.regime === r) j++;
    bands.push({ start: points[i]!.date, end: points[j]!.date, regime: r });
    i = j + 1;
  }
  return bands;
}

export function RegimeTimelineChart({ points }: { points: RegimePoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    const dates = points.map((p) => p.date);
    const bands = regimeBands(points);
    const markAreaData = bands.map((b) => [
      {
        xAxis: b.start,
        itemStyle: { color: REGIME_COLOR[b.regime], opacity: 0.16 },
      },
      { xAxis: b.end },
    ]);

    const option: echarts.EChartsCoreOption = {
      backgroundColor: "transparent",
      animation: false,
      color: [GROWTH_LINE, INFL_LINE],
      legend: {
        data: ["增长 z", "通胀动量 z"],
        textStyle: { color: "#c3c2b7", fontSize: 12 },
        top: 0,
        right: 8,
      },
      grid: { left: 44, right: 16, top: 32, bottom: 44 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1a1a19",
        borderColor: AXIS_LINE,
        textStyle: { color: "#ffffff", fontSize: 12 },
        axisPointer: { type: "cross", label: { backgroundColor: "#383835" } },
        formatter: (params: unknown) => {
          const arr = params as { axisValue: string; marker: string; seriesName: string; value: number | null }[];
          if (!arr.length) return "";
          const date = arr[0]!.axisValue;
          const p = points.find((x) => x.date === date);
          const lines = arr.map(
            (a) => `${a.marker}${a.seriesName}: ${a.value == null ? "—" : a.value.toFixed(2)}`,
          );
          const regimeLine = p
            ? `<div style="margin-top:4px">regime: <b>${REGIME_LABEL[p.regime]}</b>${p.recession === 1 ? " · NBER 衰退" : ""}</div>`
            : "";
          return `<div>${date}</div>${lines.join("<br/>")}${regimeLine}`;
        },
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
        name: "z",
        nameTextStyle: { color: INK_MUTED, fontSize: 10 },
        axisLabel: { color: INK_MUTED, fontSize: 10 },
        splitLine: { lineStyle: { color: GRID_LINE } },
        axisLine: { show: false },
      },
      series: [
        {
          name: "增长 z",
          type: "line",
          data: points.map((p) => p.growthZ),
          showSymbol: false,
          lineStyle: { width: 2 },
          markArea: { silent: true, data: markAreaData },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: AXIS_LINE, type: "dashed" },
            data: [{ yAxis: 0 }],
          },
        },
        {
          name: "通胀动量 z",
          type: "line",
          data: points.map((p) => p.inflationMomZ),
          showSymbol: false,
          lineStyle: { width: 2 },
        },
      ],
    };
    chart.setOption(option);
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [points]);
  return <div ref={ref} style={{ width: "100%", height: 340 }} />;
}
