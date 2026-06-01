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
  color?: string;
  showEndLabel?: boolean;
  stackGroup?: string;
  smooth?: boolean;
  showSymbol?: boolean;
  lineWidth?: number;
  opacity?: number;
  symbolSize?: number;
};

export type MacroSeriesVisualConfigMap = Record<string, MacroSeriesVisualConfig>;

export type MacroLegendPosition = "bottom" | "top";

export type MacroChartDisplayConfig = {
  showLegend: boolean;
  legendPosition: MacroLegendPosition;
  showGridLines: boolean;
  showTooltip: boolean;
  xLabelRotate: number;
  xLabelFontSize: number;
  yLabelFontSize: number;
  lineSmooth: boolean;
  showSymbols: boolean;
  lineWidth: number;
  areaOpacity: number;
  barMaxWidth: number;
  symbolSize: number;
  endLabelDecimals: number;
};

export const DEFAULT_MACRO_CHART_DISPLAY_CONFIG: MacroChartDisplayConfig = {
  showLegend: true,
  legendPosition: "bottom",
  showGridLines: true,
  showTooltip: true,
  xLabelRotate: 30,
  xLabelFontSize: 11,
  yLabelFontSize: 11,
  lineSmooth: true,
  showSymbols: false,
  lineWidth: 1.8,
  areaOpacity: 0.22,
  barMaxWidth: 22,
  symbolSize: 7,
  endLabelDecimals: 2,
};

export function macroPayloadToChartOption(
  slice: MacroChartSlice,
  opts?: {
    compact?: boolean;
    seriesVisualMap?: MacroSeriesVisualConfigMap;
    displayConfig?: MacroChartDisplayConfig;
  },
): EChartsOption {
  const compact = opts?.compact ?? false;
  const visualMap = opts?.seriesVisualMap ?? {};
  const display = { ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG, ...(opts?.displayConfig ?? {}) };
  const many = slice.series.length >= 5;
  const titleSize = compact ? 11 : 13;
  const legendSize = compact ? 10 : 11;
  const gridTop = compact ? 40 : 56;

  const firstCat = slice.categories[0] ?? "";
  const dailyAxis = /^\d{4}-\d{2}-\d{2}$/.test(firstCat);
  const monthlyAxis = /^\d{4}-\d{2}$/.test(firstCat);
  const quarterlyAxis = /^\d{4}-Q[1-4]$/i.test(firstCat);
  const hasEndLabels = slice.series.some((s) => {
    const k = s.key ?? s.name;
    return Boolean(visualMap[k]?.showEndLabel);
  });
  /** 仅预留「旋转日期 + 图例」必要高度；不设 containLabel，避免底部被算两次、图例离轴过远 */
  const gridBottom = (() => {
    if (compact) {
      if (dailyAxis) return many ? 104 : 86;
      if (monthlyAxis || quarterlyAxis) return many ? 96 : 78;
      return many ? 88 : 66;
    }
    if (dailyAxis) return many ? 110 : 86;
    if (monthlyAxis || quarterlyAxis) return many ? 98 : 74;
    return many ? 90 : 62;
  })();

  const longMonthlyAxis =
    slice.categories.length > 48 &&
    /^\d{4}-\d{2}$/.test(slice.categories[0] ?? "") &&
    /^\d{4}-\d{2}$/.test(slice.categories[slice.categories.length - 1] ?? "");
  const longQuarterlyAxis =
    slice.categories.length > 48 &&
    /^\d{4}-Q[1-4]$/i.test(slice.categories[0] ?? "") &&
    /^\d{4}-Q[1-4]$/i.test(slice.categories[slice.categories.length - 1] ?? "");
  const monthAxisLabelInterval = longMonthlyAxis
    ? Math.max(1, Math.floor(slice.categories.length / 18))
    : undefined;
  const quarterAxisLabelInterval = longQuarterlyAxis
    ? Math.max(1, Math.floor(slice.categories.length / 16))
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
      splitLine: display.showGridLines ? { lineStyle: { color: "#1e293b" } } : { show: false },
      axisLabel: { color: "#94a3b8", fontSize: display.yLabelFontSize },
    },
    ...(hasRightAxis
      ? [
          {
            type: "value" as const,
            position: "right" as const,
            splitLine: { show: false },
            axisLabel: { color: "#94a3b8", fontSize: display.yLabelFontSize },
          },
        ]
      : []),
  ];

  function endLabelFor(cfg: MacroSeriesVisualConfig) {
    if (!cfg.showEndLabel) return undefined;
    return {
      show: true,
      formatter: (params: { value?: unknown }) => {
        const raw = params?.value;
        const n =
          typeof raw === "number"
            ? raw
            : typeof raw === "string"
              ? Number(raw)
              : Number.NaN;
        if (!Number.isFinite(n)) return "";
        return n.toFixed(Math.max(0, Math.min(6, Math.floor(display.endLabelDecimals))));
      },
      color: cfg.color ?? "#e2e8f0",
      backgroundColor: "#0f172a",
      borderColor: cfg.color ?? "#64748b",
      borderWidth: 1,
      padding: [1, 4, 1, 4],
      borderRadius: 2,
    };
  }

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
    tooltip: display.showTooltip
      ? {
          trigger: "axis",
          textStyle: {
            fontSize: compact ? 10 : 12,
          },
          padding: compact ? [4, 6] : [7, 10],
          axisPointer: {
            type: "cross",
            crossStyle: { color: "#64748b", width: 1 },
            label: {
              color: "#e2e8f0",
              backgroundColor: "#334155",
              fontSize: compact ? 10 : 12,
              padding: compact ? [2, 4] : [3, 6],
            },
          },
        }
      : { show: false },
    legend: {
      show: display.showLegend,
      type: many ? "scroll" : "plain",
      data: slice.series.map((s) => s.name),
      textStyle: { color: "#94a3b8", fontSize: legendSize },
      ...(display.legendPosition === "top"
        ? { top: compact ? 2 : 4 }
        : { bottom: compact ? 2 : 4 }),
      width: "92%",
      left: "center",
      padding: [2, 0, 0, 0],
      itemGap: compact ? 6 : 8,
    },
    grid: {
      left: compact ? 44 : 56,
      right: hasEndLabels ? (compact ? 62 : 72) : compact ? 26 : 32,
      top: gridTop,
      bottom: gridBottom,
    },
    xAxis: {
      type: "category",
      data: slice.categories,
      boundaryGap: hasBarSeries,
      axisLabel: {
        color: "#94a3b8",
        rotate: dailyAxis ? Math.max(display.xLabelRotate, compact ? 24 : 30) : display.xLabelRotate,
        fontSize: display.xLabelFontSize,
        margin: dailyAxis ? 10 : 8,
        hideOverlap: true,
        ...(longMonthlyAxis && monthAxisLabelInterval !== undefined
          ? { interval: monthAxisLabelInterval }
          : {}),
        ...(longQuarterlyAxis && quarterAxisLabelInterval !== undefined
          ? { interval: quarterAxisLabelInterval }
          : {}),
      },
    },
    yAxis,
    series: slice.series.map((s) => {
      const k = s.key ?? s.name;
      const cfg = visualMap[k] ?? {};
      const chartType = cfg.chartType ?? "line";
      const yAxisIndex = cfg.axis === "right" && hasRightAxis ? 1 : 0;
      const lineWidth = Math.max(0.5, cfg.lineWidth ?? display.lineWidth);
      const showSymbol = cfg.showSymbol ?? display.showSymbols;
      const smooth = cfg.smooth ?? display.lineSmooth;
      const symbolSize = Math.max(2, cfg.symbolSize ?? display.symbolSize);
      const opacity = Math.max(0.05, Math.min(1, cfg.opacity ?? 1));

      if (chartType === "bar") {
        return {
          name: s.name,
          type: "bar",
          yAxisIndex,
          data: s.data,
          itemStyle: cfg.color ? { color: cfg.color, opacity } : { opacity },
          barMaxWidth: Math.max(6, display.barMaxWidth),
        };
      }
      if (chartType === "stackBar") {
        return {
          name: s.name,
          type: "bar",
          yAxisIndex,
          stack: cfg.stackGroup ?? `stack-${yAxisIndex}`,
          data: s.data,
          itemStyle: cfg.color ? { color: cfg.color, opacity } : { opacity },
          barMaxWidth: Math.max(6, display.barMaxWidth),
        };
      }
      if (chartType === "scatter") {
        return {
          name: s.name,
          type: "scatter",
          yAxisIndex,
          data: s.data,
          symbolSize,
          itemStyle: cfg.color ? { color: cfg.color, opacity } : { opacity },
        };
      }
      if (chartType === "area") {
        return {
          name: s.name,
          type: "line",
          yAxisIndex,
          smooth,
          connectNulls: true,
          showSymbol,
          symbolSize,
          lineStyle: cfg.color ? { color: cfg.color, width: lineWidth, opacity } : { width: lineWidth, opacity },
          itemStyle: cfg.color ? { color: cfg.color, opacity } : { opacity },
          areaStyle: { opacity: Math.max(0.05, Math.min(1, display.areaOpacity * opacity)), color: cfg.color },
          endLabel: endLabelFor(cfg),
          clip: false,
          data: s.data,
        };
      }
      if (chartType === "stackArea") {
        return {
          name: s.name,
          type: "line",
          yAxisIndex,
          stack: cfg.stackGroup ?? `stack-${yAxisIndex}`,
          smooth,
          connectNulls: true,
          showSymbol,
          symbolSize,
          lineStyle: cfg.color ? { color: cfg.color, width: lineWidth, opacity } : { width: lineWidth, opacity },
          itemStyle: cfg.color ? { color: cfg.color, opacity } : { opacity },
          areaStyle: { opacity: Math.max(0.05, Math.min(1, display.areaOpacity * opacity)), color: cfg.color },
          endLabel: endLabelFor(cfg),
          clip: false,
          data: s.data,
        };
      }
      if (chartType === "stepLine") {
        return {
          name: s.name,
          type: "line",
          yAxisIndex,
          connectNulls: true,
          showSymbol,
          symbolSize,
          step: "middle",
          lineStyle: cfg.color ? { color: cfg.color, width: lineWidth, opacity } : { width: lineWidth, opacity },
          itemStyle: cfg.color ? { color: cfg.color, opacity } : { opacity },
          endLabel: endLabelFor(cfg),
          clip: false,
          data: s.data,
        };
      }
      if (chartType === "dashedLine") {
        return {
          name: s.name,
          type: "line",
          yAxisIndex,
          smooth,
          connectNulls: true,
          showSymbol,
          symbolSize,
          lineStyle: {
            type: "dashed",
            width: lineWidth,
            opacity,
            ...(cfg.color ? { color: cfg.color } : {}),
          },
          itemStyle: cfg.color ? { color: cfg.color, opacity } : { opacity },
          endLabel: endLabelFor(cfg),
          clip: false,
          data: s.data,
        };
      }
      return {
        name: s.name,
        type: "line",
        yAxisIndex,
        smooth,
        connectNulls: true,
        showSymbol,
        symbolSize,
        lineStyle: cfg.color ? { color: cfg.color, width: lineWidth, opacity } : { width: lineWidth, opacity },
        itemStyle: cfg.color ? { color: cfg.color, opacity } : { opacity },
        endLabel: endLabelFor(cfg),
        clip: false,
        data: s.data,
      };
    }),
  };
}
