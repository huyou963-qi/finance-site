import type { EChartsOption } from "echarts";
import type { MacroPayload } from "@/lib/data/types";

export type MacroChartSlice = Pick<MacroPayload, "categories" | "series"> & {
  title?: string;
};

export function macroPayloadToChartOption(
  slice: MacroChartSlice,
  opts?: { compact?: boolean },
): EChartsOption {
  const compact = opts?.compact ?? false;
  const many = slice.series.length > 6;
  const titleSize = compact ? 11 : 13;
  const legendSize = compact ? 10 : 11;
  const gridTop = compact ? 40 : 56;
  const gridBottom = compact ? (many ? 72 : 44) : many ? 92 : 56;

  const longMonthlyAxis =
    slice.categories.length > 48 &&
    /^\d{4}-\d{2}$/.test(slice.categories[0] ?? "") &&
    /^\d{4}-\d{2}$/.test(slice.categories[slice.categories.length - 1] ?? "");
  const monthAxisLabelInterval = longMonthlyAxis
    ? Math.max(1, Math.floor(slice.categories.length / 18))
    : undefined;

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
      boundaryGap: false,
      axisLabel: {
        color: "#94a3b8",
        rotate: compact ? 35 : 45,
        fontSize: compact ? 10 : 11,
        ...(longMonthlyAxis && monthAxisLabelInterval !== undefined
          ? { interval: monthAxisLabelInterval }
          : {}),
      },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#1e293b" } },
      axisLabel: { color: "#94a3b8", fontSize: compact ? 10 : 11 },
    },
    series: slice.series.map((s) => ({
      name: s.name,
      type: "line",
      smooth: true,
      connectNulls: true,
      showSymbol: false,
      data: s.data,
    })),
  };
}
