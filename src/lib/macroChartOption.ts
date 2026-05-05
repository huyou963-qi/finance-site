import type { EChartsOption } from "echarts";
import type { MacroPayload } from "@/lib/data/types";

export type MacroChartSlice = Pick<MacroPayload, "categories" | "series"> & {
  title?: string;
};

export type MacroSeriesAxis = "left" | "right";
export type MacroSeriesChartType =
  | "line"
  | "bar"
  | "area"
  | "stackArea"
  | "stackBar"
  | "stepLine"
  | "scatter"
  | "dashedLine";

export type MacroSeriesVisualConfig = {
  axis?: MacroSeriesAxis;
  chartType?: MacroSeriesChartType;
};

export type MacroSeriesVisualConfigMap = Record<string, MacroSeriesVisualConfig>;

export function macroPayloadToChartOption(
  slice: MacroChartSlice,
  opts?: { compact?: boolean; seriesVisualMap?: MacroSeriesVisualConfigMap },
): EChartsOption {
  const compact = opts?.compact ?? false;
  const visualMap = opts?.seriesVisualMap ?? {};
  const many = slice.series.length > 6;
  const titleSize = compact ? 11 : 13;
  const legendSize = compact ? 10 : 11;
  const gridTop = compact ? 40 : 56;

  const firstCat = slice.categories[0] ?? "";
  const dailyAxis = /^\d{4}-\d{2}-\d{2}$/.test(firstCat);
  /** 仅预留「旋转日期 + 图例」必要高度；不设 containLabel，避免底部被算两次、图例离轴过远 */
  const gridBottom = (() => {
    if (compact) {
      if (dailyAxis) return many ? 76 : 58;
      return many ? 68 : 42;
    }
    if (dailyAxis) return many ? 92 : 72;
    return many ? 84 : 54;
  })();

  const longMonthlyAxis =
    slice.categories.length > 48 &&
    /^\d{4}-\d{2}$/.test(slice.categories[0] ?? "") &&
    /^\d{4}-\d{2}$/.test(slice.categories[slice.categories.length - 1] ?? "");
  const monthAxisLabelInterval = longMonthlyAxis
    ? Math.max(1, Math.floor(slice.categories.length / 18))
    : undefined;

  const hasRightAxis = slice.series.some((s) => {
    const k = s.key ?? s.name;
    return visualMap[k]?.axis === "right";
  });
  const hasBarSeries = slice.series.some((s) => {
    const k = s.key ?? s.name;
    const t = visualMap[k]?.chartType;
    return t === "bar" || t === "stackBar";
  });
  const yAxis: EChartsOption["yAxis"] = [
    {
      type: "value",
      position: "left",
      splitLine: { lineStyle: { color: "#1e293b" } },
      axisLabel: { color: "#94a3b8", fontSize: compact ? 10 : 11 },
    },
    ...(hasRightAxis
      ? [
          {
            type: "value" as const,
            position: "right" as const,
            splitLine: { show: false },
            axisLabel: { color: "#94a3b8", fontSize: compact ? 10 : 11 },
          },
        ]
      : []),
  ];

  return {
    title: slice.title
      ? {
          text: slice.title,
          left: "center",
          textStyle: {
            color: "#cbd5e1",
            fontSize: titleSize,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: "#cbd5e1", fontSize: compact ? 11 : 12 },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross",
        crossStyle: { color: "#64748b", width: 1 },
        label: { color: "#e2e8f0", backgroundColor: "#334155" },
      },
    },
    legend: {
      type: many ? "scroll" : "plain",
      data: slice.series.map((s) => s.name),
      textStyle: { color: "#94a3b8", fontSize: legendSize },
      bottom: 0,
      width: "92%",
      left: "center",
      padding: [2, 0, 0, 0],
      itemGap: 8,
    },
    grid: {
      left: compact ? 44 : 56,
      right: compact ? 16 : 24,
      top: gridTop,
      bottom: gridBottom,
    },
    xAxis: {
      type: "category",
      data: slice.categories,
      boundaryGap: hasBarSeries,
      axisLabel: {
        color: "#94a3b8",
        rotate: compact ? 35 : 45,
        fontSize: compact ? 10 : 11,
        margin: dailyAxis ? 10 : 8,
        ...(longMonthlyAxis && monthAxisLabelInterval !== undefined
          ? { interval: monthAxisLabelInterval }
          : {}),
      },
    },
    yAxis,
    series: slice.series.map((s) => {
      const k = s.key ?? s.name;
      const cfg = visualMap[k] ?? {};
      const chartType = cfg.chartType ?? "line";
      const yAxisIndex = cfg.axis === "right" && hasRightAxis ? 1 : 0;

      if (chartType === "bar") {
        return {
          name: s.name,
          type: "bar",
          yAxisIndex,
          data: s.data,
          barMaxWidth: compact ? 16 : 22,
        };
      }
      if (chartType === "stackBar") {
        return {
          name: s.name,
          type: "bar",
          yAxisIndex,
          stack: `stack-${yAxisIndex}`,
          data: s.data,
          barMaxWidth: compact ? 16 : 22,
        };
      }
      if (chartType === "scatter") {
        return {
          name: s.name,
          type: "scatter",
          yAxisIndex,
          data: s.data,
          symbolSize: compact ? 5 : 7,
        };
      }
      if (chartType === "area") {
        return {
          name: s.name,
          type: "line",
          yAxisIndex,
          smooth: true,
          connectNulls: true,
          showSymbol: false,
          areaStyle: { opacity: 0.22 },
          data: s.data,
        };
      }
      if (chartType === "stackArea") {
        return {
          name: s.name,
          type: "line",
          yAxisIndex,
          stack: `stack-${yAxisIndex}`,
          smooth: true,
          connectNulls: true,
          showSymbol: false,
          areaStyle: { opacity: 0.22 },
          data: s.data,
        };
      }
      if (chartType === "stepLine") {
        return {
          name: s.name,
          type: "line",
          yAxisIndex,
          connectNulls: true,
          showSymbol: false,
          step: "middle",
          data: s.data,
        };
      }
      if (chartType === "dashedLine") {
        return {
          name: s.name,
          type: "line",
          yAxisIndex,
          smooth: true,
          connectNulls: true,
          showSymbol: false,
          lineStyle: { type: "dashed" },
          data: s.data,
        };
      }
      return {
        name: s.name,
        type: "line",
        yAxisIndex,
        smooth: true,
        connectNulls: true,
        showSymbol: false,
        data: s.data,
      };
    }),
  };
}
