"use client";

/**
 * 稳健性分析图表（P2 WS4）。echarts/core 树摇导入，暗色，口径同 BacktestCharts/FactorResearchCharts。
 * - IsOosNavChart：样本内(蓝)/样本外(琥珀)两段异色净值，分割处 markLine，OOS 段从 IS 末值续接。
 * - WalkforwardNavChart：各 OOS 测试段拼成的连续净值（单蓝线 + 交替 markArea 标注段界）。
 * 参数扫描热力图用 HTML 表格（见 client，diverging 红↔蓝），非 echarts。
 */

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

const SERIES_BLUE = "#3987e5";
const OOS_AMBER = "#c98500";
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

export type SplitNav = { date: string; nav: number };

/**
 * 样本内 / 样本外净值对照：IS 蓝、OOS 琥珀，分割处竖线。
 * OOS 段（自归一起点=1）乘以 IS 末值续接，读作一条连续曲线但两段异色。
 */
export function IsOosNavChart({
  isNav,
  oosNav,
  splitDate,
}: {
  isNav: SplitNav[];
  oosNav: SplitNav[];
  splitDate: string;
}) {
  const isTail = isNav.length ? isNav[isNav.length - 1]!.nav : 1;
  const oosScaled = oosNav.map((p) => ({ date: p.date, nav: p.nav * isTail }));
  // 合并 x 轴（去重分割点）
  const dates = [...isNav.map((p) => p.date), ...oosScaled.map((p) => p.date)];
  const isLen = isNav.length;
  const isData = dates.map((_, i) => (i < isLen ? isNav[i]!.nav : null));
  // OOS 从 IS 末点开始连（含衔接点）
  const oosData = dates.map((_, i) => {
    if (i === isLen - 1) return isTail; // 衔接点
    if (i >= isLen) return oosScaled[i - isLen]!.nav;
    return null;
  });
  const option: echarts.EChartsCoreOption = {
    backgroundColor: "transparent",
    animation: false,
    color: [SERIES_BLUE, OOS_AMBER],
    legend: {
      data: ["样本内 (IS)", "样本外 (OOS)"],
      textStyle: { color: "#c3c2b7", fontSize: 12 },
      top: 0,
      right: 8,
    },
    grid: { left: 52, right: 20, top: 32, bottom: 44 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a1a19",
      borderColor: AXIS_LINE,
      textStyle: { color: "#ffffff", fontSize: 12 },
      axisPointer: { type: "cross", label: { backgroundColor: "#383835" } },
      valueFormatter: (v: unknown) => (typeof v === "number" ? `${v.toFixed(3)}×` : "—"),
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
      axisLabel: { color: INK_MUTED, fontSize: 10, formatter: (v: number | string) => `${v}×` },
      splitLine: { lineStyle: { color: GRID_LINE } },
      axisLine: { show: false },
    },
    series: [
      {
        name: "样本内 (IS)",
        type: "line",
        data: isData,
        showSymbol: false,
        lineStyle: { width: 2 },
        markLine: {
          silent: true,
          symbol: "none",
          label: { color: OOS_AMBER, fontSize: 10, formatter: "分割" },
          lineStyle: { color: OOS_AMBER, type: "dashed" },
          data: [{ xAxis: splitDate }],
        },
      },
      {
        name: "样本外 (OOS)",
        type: "line",
        data: oosData,
        showSymbol: false,
        lineStyle: { width: 2 },
        connectNulls: true,
      },
    ],
  };
  return useChart(option, 300);
}

export type StitchedPoint = { date: string; nav: number; segment: number };

/** walk-forward 拼接净值：单蓝线 + 交替 markArea 标注各 OOS 测试段段界。 */
export function WalkforwardNavChart({ stitched }: { stitched: StitchedPoint[] }) {
  const dates = stitched.map((p) => p.date);
  // 交替段的 markArea 区间（相邻同色不区分，交替淡色带标段界）
  const areas: [{ xAxis: string }, { xAxis: string }][] = [];
  let segStart = 0;
  for (let i = 1; i <= stitched.length; i++) {
    if (i === stitched.length || stitched[i]!.segment !== stitched[segStart]!.segment) {
      if (stitched[segStart]!.segment % 2 === 1) {
        areas.push([{ xAxis: dates[segStart]! }, { xAxis: dates[i - 1]! }]);
      }
      segStart = i;
    }
  }
  const option: echarts.EChartsCoreOption = {
    backgroundColor: "transparent",
    animation: false,
    color: [SERIES_BLUE],
    grid: { left: 52, right: 20, top: 16, bottom: 44 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#1a1a19",
      borderColor: AXIS_LINE,
      textStyle: { color: "#ffffff", fontSize: 12 },
      axisPointer: { type: "cross", label: { backgroundColor: "#383835" } },
      valueFormatter: (v: unknown) => (typeof v === "number" ? `${v.toFixed(3)}×` : "—"),
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
      axisLabel: { color: INK_MUTED, fontSize: 10, formatter: (v: number | string) => `${v}×` },
      splitLine: { lineStyle: { color: GRID_LINE } },
      axisLine: { show: false },
    },
    series: [
      {
        name: "样本外拼接净值",
        type: "line",
        data: stitched.map((p) => p.nav),
        showSymbol: false,
        lineStyle: { width: 2 },
        markArea: {
          silent: true,
          itemStyle: { color: "rgba(57,135,229,0.06)" },
          data: areas,
        },
      },
    ],
  };
  return useChart(option, 300);
}
