"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  formatCompactMoney,
  formatCompactMoneyAxis,
  formatFundamentalSeriesValue,
  formatMultiplier,
  formatPct,
  formatPctAxis,
  formatRatio,
  formatSignedPct,
} from "@/lib/equity/formatFundamentalsDisplay";
import type { DimensionChart, DimensionUnit } from "@/lib/equity/overviewDimensions";

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

type AxisTooltipItem = {
  axisValue?: string | number;
  axisValueLabel?: string;
  seriesName?: string;
  value?: unknown;
  marker?: string;
};

function readNumericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    return typeof last === "number" && Number.isFinite(last) ? last : null;
  }
  return null;
}

/** 统一 axis tooltip：按系列名套用金额/百分比/EPS 等格式 */
function fundamentalAxisTooltip(
  raw: unknown,
  formatValue: (seriesName: string, value: number) => string = formatFundamentalSeriesValue,
): string {
  const items = (Array.isArray(raw) ? raw : [raw]) as AxisTooltipItem[];
  const head = String(items[0]?.axisValueLabel ?? items[0]?.axisValue ?? "");
  const lines: string[] = [];
  for (const item of items) {
    const n = readNumericValue(item.value);
    if (n == null) continue;
    const name = item.seriesName ?? "";
    lines.push(`${item.marker ?? ""}${name}: ${formatValue(name, n)}`);
  }
  return [head, ...lines].join("<br/>");
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
    tooltip: {
      trigger: "axis" as const,
      confine: true,
      formatter: (raw: unknown) => fundamentalAxisTooltip(raw),
    },
    legend: { textStyle: { color: "#9da8b6", fontSize: 11 }, top: 0 },
    grid: { left: 52, right: 48, top: 30, bottom: 24 },
    xAxis: { type: "category" as const, data: periods, ...AXIS_STYLE },
  };
}

const UNIT_AXIS_FORMAT: Record<DimensionUnit, (v: number) => string> = {
  money: (v) => formatCompactMoneyAxis(v),
  // 净息差、信用成本等常在 0–3% 之间，取整会出现重复刻度，保留至多一位小数
  pct: (v) => `${Number((v * 100).toFixed(1))}%`,
  signedPct: (v) => `${Number((v * 100).toFixed(1))}%`,
  // REIT 资产周转率约 0.08x、利息覆盖可达数十倍：按 3 位有效数字避免重复刻度
  multiple: (v) => `${Math.abs(v) >= 100 ? v.toFixed(0) : Number(v.toPrecision(3))}x`,
  days: (v) => `${v.toFixed(0)}天`,
};

const UNIT_VALUE_FORMAT: Record<DimensionUnit, (v: number) => string> = {
  money: (v) => formatCompactMoney(v),
  pct: (v) => formatPct(v),
  signedPct: (v) => formatSignedPct(v),
  multiple: (v) => formatMultiplier(v, 2),
  days: (v) => `${v.toFixed(0)} 天`,
};

/** 七维度概览的通用图：按规格画柱/线、左右双轴、单位格式 */
export function DimensionChartView({
  periods,
  chart,
  height = 230,
}: {
  periods: string[];
  chart: DimensionChart;
  height?: number;
}) {
  const option = useMemo(() => {
    const unitByName = new Map(chart.series.map((s) => [s.name, s.unit]));
    const axisUnits = ([0, 1] as const).map(
      (axis) => chart.series.find((s) => s.axis === axis)?.unit ?? null,
    );
    const axisHasBar = ([0, 1] as const).map((axis) =>
      chart.series.some((s) => s.axis === axis && s.type === "bar"),
    );
    const useRightAxis = axisUnits[1] != null;
    const selected = Object.fromEntries(chart.series.map((s) => [s.name, !s.hidden]));
    return {
      ...baseOption(periods),
      legend: {
        type: "scroll" as const,
        textStyle: { color: "#9da8b6", fontSize: 11 },
        pageTextStyle: { color: "#9da8b6" },
        pageIconColor: "#9da8b6",
        top: 0,
        selected,
      },
      tooltip: {
        trigger: "axis" as const,
        confine: true,
        formatter: (raw: unknown) =>
          fundamentalAxisTooltip(raw, (name, value) =>
            UNIT_VALUE_FORMAT[unitByName.get(name) ?? "pct"](value),
          ),
      },
      grid: { left: 52, right: useRightAxis ? 52 : 16, top: 30, bottom: 24 },
      yAxis: ([0, 1] as const)
        .filter((axis) => axis === 0 || useRightAxis)
        .map((axis) => {
          const unit = axisUnits[axis] ?? "pct";
          return {
            type: "value" as const,
            // 柱从 0 起才不误导；纯折线轴按数据范围缩放
            scale: !axisHasBar[axis],
            ...AXIS_STYLE,
            ...(axis === 0 ? SPLIT_LINE : { splitLine: { show: false } }),
            axisLabel: { ...AXIS_STYLE.axisLabel, formatter: UNIT_AXIS_FORMAT[unit] },
          };
        }),
      series: chart.series.map((s) => ({
        name: s.name,
        type: s.type,
        yAxisIndex: useRightAxis ? s.axis : 0,
        data: s.data,
        stack: s.stack,
        showSymbol: false,
        connectNulls: false,
        barMaxWidth: s.stack ? 22 : 14,
        itemStyle: { color: s.color },
        lineStyle: s.dashed ? { type: "dashed" as const } : undefined,
      })),
    };
  }, [periods, chart]);
  const ref = useChart(option);
  return <div ref={ref} style={{ width: "100%", height }} />;
}

export type RatioPoint = {
  period: string;
  roeTtm: number | null;
  roaTtm: number | null;
  netMarginTtm: number | null;
  equityMultiplier: number | null;
};

export type ValuationBandPoint = { t: number; pe: number | null; pb: number | null };

/** 估值历史带：PE(TTM) 左轴 + PB 右轴，时间轴 */
export function ValuationBandChart({
  points,
  primaryName = "PE (TTM)",
  height = 240,
}: {
  points: ValuationBandPoint[];
  /** 左轴估值倍数名称：一般为 PE (TTM)，REIT 为 P/FFO (TTM) */
  primaryName?: string;
  height?: number;
}) {
  const ref = useChart({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      confine: true,
      formatter: (raw: unknown) =>
        fundamentalAxisTooltip(raw, (_name, value) => formatRatio(value, 2)),
    },
    legend: { textStyle: { color: "#9da8b6", fontSize: 11 }, top: 0 },
    grid: { left: 52, right: 48, top: 30, bottom: 24 },
    xAxis: { type: "time", ...AXIS_STYLE },
    yAxis: [
      {
        type: "value",
        scale: true,
        ...AXIS_STYLE,
        ...SPLIT_LINE,
        axisLabel: {
          ...AXIS_STYLE.axisLabel,
          formatter: (v: number) => formatRatio(v, 1),
        },
      },
      {
        type: "value",
        scale: true,
        ...AXIS_STYLE,
        splitLine: { show: false },
        axisLabel: {
          ...AXIS_STYLE.axisLabel,
          formatter: (v: number) => formatRatio(v, 1),
        },
      },
    ],
    series: [
      {
        name: primaryName,
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
