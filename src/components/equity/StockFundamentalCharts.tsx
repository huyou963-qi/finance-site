"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export type FundamentalQuarterPoint = {
  period: string;
  fiscalDate: string;
  revenue: number | null;
  revenueYoY: number | null;
  grossMargin: number | null;
  opMargin: number | null;
  netMargin: number | null;
  eps: number | null;
  epsYoY: number | null;
  ocf: number | null;
  capex: number | null;
  fcf: number | null;
};

const AXIS_STYLE = {
  axisLabel: { color: "#9da8b6", fontSize: 10 },
  axisLine: { lineStyle: { color: "#2a3340" } },
} as const;

const SPLIT_LINE = { splitLine: { lineStyle: { color: "#1e2630" } } } as const;

function fmtBillions(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toFixed(0);
}

function useChart(option: echarts.EChartsCoreOption) {
  const ref = useRef<HTMLDivElement>(null);
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
  return ref;
}

function baseOption(periods: string[]) {
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: "#9da8b6", fontSize: 11 }, top: 0 },
    grid: { left: 52, right: 48, top: 30, bottom: 24 },
    xAxis: { type: "category", data: periods, ...AXIS_STYLE },
  };
}

/** 柱（量值）+ 线（同比%）双轴季度图 */
function BarYoYChart({
  periods,
  barName,
  barData,
  lineName,
  lineData,
  barFormatter,
  height = 220,
}: {
  periods: string[];
  barName: string;
  barData: (number | null)[];
  lineName: string;
  lineData: (number | null)[];
  barFormatter?: (v: number) => string;
  height?: number;
}) {
  const ref = useChart({
    ...baseOption(periods),
    yAxis: [
      {
        type: "value",
        scale: true,
        ...AXIS_STYLE,
        ...SPLIT_LINE,
        axisLabel: {
          ...AXIS_STYLE.axisLabel,
          formatter: barFormatter ?? ((v: number) => fmtBillions(v)),
        },
      },
      {
        type: "value",
        scale: true,
        ...AXIS_STYLE,
        splitLine: { show: false },
        axisLabel: {
          ...AXIS_STYLE.axisLabel,
          formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
        },
      },
    ],
    series: [
      {
        name: barName,
        type: "bar",
        data: barData,
        itemStyle: { color: "#4c8dff" },
        barMaxWidth: 26,
      },
      {
        name: lineName,
        type: "line",
        yAxisIndex: 1,
        data: lineData,
        showSymbol: false,
        itemStyle: { color: "#f2c94c" },
      },
    ],
  });
  return <div ref={ref} style={{ width: "100%", height }} />;
}

/** 利润率多线图（%） */
function MarginChart({
  periods,
  lines,
  height = 220,
}: {
  periods: string[];
  lines: { name: string; data: (number | null)[]; color: string }[];
  height?: number;
}) {
  const ref = useChart({
    ...baseOption(periods),
    yAxis: {
      type: "value",
      scale: true,
      ...AXIS_STYLE,
      ...SPLIT_LINE,
      axisLabel: {
        ...AXIS_STYLE.axisLabel,
        formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
      },
    },
    series: lines.map((l) => ({
      name: l.name,
      type: "line",
      data: l.data,
      showSymbol: false,
      itemStyle: { color: l.color },
    })),
  });
  return <div ref={ref} style={{ width: "100%", height }} />;
}

/** 现金流：OCF/CapEx/FCF 柱组 */
function CashflowChart({
  periods,
  ocf,
  capex,
  fcf,
  height = 220,
}: {
  periods: string[];
  ocf: (number | null)[];
  capex: (number | null)[];
  fcf: (number | null)[];
  height?: number;
}) {
  const ref = useChart({
    ...baseOption(periods),
    yAxis: {
      type: "value",
      scale: true,
      ...AXIS_STYLE,
      ...SPLIT_LINE,
      axisLabel: { ...AXIS_STYLE.axisLabel, formatter: (v: number) => fmtBillions(v) },
    },
    series: [
      { name: "经营现金流", type: "bar", data: ocf, itemStyle: { color: "#4c8dff" }, barMaxWidth: 16 },
      {
        name: "资本开支",
        type: "bar",
        data: capex.map((v) => (v == null ? null : -v)),
        itemStyle: { color: "#ef6461" },
        barMaxWidth: 16,
      },
      { name: "自由现金流", type: "bar", data: fcf, itemStyle: { color: "#3ecf8e" }, barMaxWidth: 16 },
    ],
  });
  return <div ref={ref} style={{ width: "100%", height }} />;
}

export type RatioPoint = {
  period: string;
  roeTtm: number | null;
  roaTtm: number | null;
  netMarginTtm: number | null;
  equityMultiplier: number | null;
};

/** 盈利能力（TTM）：ROE/ROA/净利率 % 线 + 权益乘数右轴（杜邦视角） */
export function RoeDupontChart({ ratios, height = 220 }: { ratios: RatioPoint[]; height?: number }) {
  const ref = useChart({
    ...baseOption(ratios.map((r) => r.period)),
    yAxis: [
      {
        type: "value",
        scale: true,
        ...AXIS_STYLE,
        ...SPLIT_LINE,
        axisLabel: {
          ...AXIS_STYLE.axisLabel,
          formatter: (v: number) => `${(v * 100).toFixed(0)}%`,
        },
      },
      {
        type: "value",
        scale: true,
        ...AXIS_STYLE,
        splitLine: { show: false },
        axisLabel: { ...AXIS_STYLE.axisLabel, formatter: (v: number) => `${v.toFixed(1)}x` },
      },
    ],
    series: [
      {
        name: "ROE (TTM)",
        type: "line",
        data: ratios.map((r) => r.roeTtm),
        showSymbol: false,
        itemStyle: { color: "#4c8dff" },
      },
      {
        name: "ROA (TTM)",
        type: "line",
        data: ratios.map((r) => r.roaTtm),
        showSymbol: false,
        itemStyle: { color: "#3ecf8e" },
      },
      {
        name: "净利率 (TTM)",
        type: "line",
        data: ratios.map((r) => r.netMarginTtm),
        showSymbol: false,
        itemStyle: { color: "#f2c94c" },
      },
      {
        name: "权益乘数",
        type: "line",
        yAxisIndex: 1,
        data: ratios.map((r) => r.equityMultiplier),
        showSymbol: false,
        lineStyle: { type: "dashed" },
        itemStyle: { color: "#9da8b6" },
      },
    ],
  });
  return <div ref={ref} style={{ width: "100%", height }} />;
}

export type ValuationBandPoint = { t: number; pe: number | null; pb: number | null };

/** 估值历史带：PE(TTM) 左轴 + PB 右轴，时间轴 */
export function ValuationBandChart({
  points,
  height = 240,
}: {
  points: ValuationBandPoint[];
  height?: number;
}) {
  const ref = useChart({
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { textStyle: { color: "#9da8b6", fontSize: 11 }, top: 0 },
    grid: { left: 52, right: 48, top: 30, bottom: 24 },
    xAxis: { type: "time", ...AXIS_STYLE },
    yAxis: [
      { type: "value", scale: true, ...AXIS_STYLE, ...SPLIT_LINE },
      { type: "value", scale: true, ...AXIS_STYLE, splitLine: { show: false } },
    ],
    series: [
      {
        name: "PE (TTM)",
        type: "line",
        showSymbol: false,
        data: points.map((p) => [p.t * 1000, p.pe]),
        itemStyle: { color: "#4c8dff" },
      },
      {
        name: "PB",
        type: "line",
        yAxisIndex: 1,
        showSymbol: false,
        data: points.map((p) => [p.t * 1000, p.pb]),
        itemStyle: { color: "#f2c94c" },
      },
    ],
  });
  return <div ref={ref} style={{ width: "100%", height }} />;
}

/** 逐季基本面 2×2 图组：营收/YoY、利润率、EPS/YoY、现金流 */
export function StockFundamentalTrend({ quarters }: { quarters: FundamentalQuarterPoint[] }) {
  const periods = quarters.map((q) => q.period);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <div className="px-1 pb-1 text-xs text-fs-muted">单季营收与同比</div>
        <BarYoYChart
          periods={periods}
          barName="营收"
          barData={quarters.map((q) => q.revenue)}
          lineName="营收 YoY"
          lineData={quarters.map((q) => q.revenueYoY)}
        />
      </div>
      <div>
        <div className="px-1 pb-1 text-xs text-fs-muted">利润率</div>
        <MarginChart
          periods={periods}
          lines={[
            { name: "毛利率", data: quarters.map((q) => q.grossMargin), color: "#4c8dff" },
            { name: "营业利润率", data: quarters.map((q) => q.opMargin), color: "#f2c94c" },
            { name: "净利率", data: quarters.map((q) => q.netMargin), color: "#3ecf8e" },
          ]}
        />
      </div>
      <div>
        <div className="px-1 pb-1 text-xs text-fs-muted">单季稀释 EPS 与同比</div>
        <BarYoYChart
          periods={periods}
          barName="EPS"
          barData={quarters.map((q) => q.eps)}
          lineName="EPS YoY"
          lineData={quarters.map((q) => q.epsYoY)}
          barFormatter={(v) => v.toFixed(2)}
        />
      </div>
      <div>
        <div className="px-1 pb-1 text-xs text-fs-muted">单季现金流（资本开支取负向展示）</div>
        <CashflowChart
          periods={periods}
          ocf={quarters.map((q) => q.ocf)}
          capex={quarters.map((q) => q.capex)}
          fcf={quarters.map((q) => q.fcf)}
        />
      </div>
    </div>
  );
}
