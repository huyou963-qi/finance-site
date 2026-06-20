import type { EChartsOption } from "echarts";
import type { MacroPayload } from "@/lib/data/types";
import { formatMacroDisplayNumber, formatMacroDisplayValue, normalizeMacroAxisExtent } from "@/lib/formatMacroValue";

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
export type MacroChartSlotMode = "timeSeries" | "pie" | "seasonal";

export const DEFAULT_SEASONAL_YEAR_COUNT = 5;

export type MacroAxisRangeMode = "auto" | "manual";

export type MacroAxisRange = {
  mode?: MacroAxisRangeMode;
  min?: number;
  max?: number;
};

export type MacroSlotAxisRanges = {
  left?: MacroAxisRange;
  right?: MacroAxisRange;
};

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
  /** 各图槽展示模式，默认时序图 */
  slotModes?: Partial<Record<number, MacroChartSlotMode>>;
  /** 饼图各槽使用的年份（如 "2024"） */
  slotPieYears?: Partial<Record<number, string>>;
  /** 季节图各槽展示的近年数量，默认 5 */
  slotSeasonalYearCount?: Partial<Record<number, number>>;
  /** 各图槽自定义标题（留空则用默认「图 N」或单图时的数据标题） */
  slotTitles?: Partial<Record<number, string>>;
  /** 各图槽是否在图表上显示标题，默认 true */
  slotShowTitles?: Partial<Record<number, boolean>>;
  /** 各图槽左右 Y 轴范围（时序图 / 季节图） */
  slotAxisRanges?: Partial<Record<number, MacroSlotAxisRanges>>;
};

export function resolveSlotAxisRanges(
  displayConfig: MacroChartDisplayConfig | undefined,
  slot: number,
): MacroSlotAxisRanges | undefined {
  return displayConfig?.slotAxisRanges?.[slot];
}

export function computePaddedValueExtent(
  values: number[],
  padRatio = 0.12,
): { min: number; max: number } | null {
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const pad = span > 0 ? span * padRatio : Math.max(Math.abs(hi) * 0.05, 1);
  return { min: lo - pad, max: hi + pad };
}

/** 从图内序列收集某侧 Y 轴上的有效数值 */
export function collectSeriesValuesOnAxis(
  slice: MacroChartSlice,
  visualMap: MacroSeriesVisualConfigMap,
  axis: "left" | "right",
): number[] {
  const values: number[] = [];
  for (const s of slice.series) {
    const k = s.key ?? s.name;
    const onRight = visualMap[k]?.axis === "right";
    if (axis === "left" ? onRight : !onRight) continue;
    for (const v of s.data) {
      if (typeof v === "number" && Number.isFinite(v)) values.push(v);
    }
  }
  return values;
}

export function computeAxisExtentFromSlice(
  slice: MacroChartSlice,
  visualMap: MacroSeriesVisualConfigMap,
  axis: "left" | "right",
): { min: number; max: number } | null {
  return computePaddedValueExtent(collectSeriesValuesOnAxis(slice, visualMap, axis));
}

function resolveAppliedAxisExtent(
  range: MacroAxisRange | undefined,
  autoExtent: { min: number; max: number } | null,
): { min: number; max: number; scale: true } | null {
  const mode = range?.mode ?? "auto";
  if (mode === "manual") {
    const min = range?.min;
    const max = range?.max;
    if (typeof min === "number" && Number.isFinite(min) && typeof max === "number" && Number.isFinite(max)) {
      if (min < max) return { min, max, scale: true as const };
    }
    return null;
  }
  if (autoExtent) {
    const { min, max } = normalizeMacroAxisExtent(autoExtent);
    return { min, max, scale: true as const };
  }
  return null;
}

function macroValueAxisLabel(fontSize: number) {
  return {
    color: "#94a3b8",
    fontSize,
    formatter: (value: number) => formatMacroDisplayValue(value),
  };
}

/** 解析图槽在图表上显示的标题；返回 undefined 表示不显示 */
export function resolveMacroSlotTitle(
  slot: number,
  layoutMode: number,
  displayConfig?: MacroChartDisplayConfig,
  options?: { seriesLabel?: string },
): string | undefined {
  const cfg = { ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG, ...(displayConfig ?? {}) };
  const show = cfg.slotShowTitles?.[slot] ?? true;
  if (!show) return undefined;
  const custom = cfg.slotTitles?.[slot]?.trim();
  if (custom) return custom;
  if (layoutMode === 1 && slot === 0) {
    const label = options?.seriesLabel?.trim();
    return label || undefined;
  }
  if (layoutMode > 1) return `图 ${slot + 1}`;
  return undefined;
}

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

export function yearFromCategoryLabel(label: string): string | null {
  const m = /^(\d{4})/.exec(label.trim());
  return m ? m[1]! : null;
}

export function extractYearsFromCategories(categories: string[]): string[] {
  const years = new Set<string>();
  for (const cat of categories) {
    const y = yearFromCategoryLabel(cat);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

export function lastCategoryIndexForYear(categories: string[], year: string): number {
  let last = -1;
  for (let i = 0; i < categories.length; i++) {
    if (yearFromCategoryLabel(categories[i] ?? "") === year) last = i;
  }
  return last;
}

export function resolveSlotPieYear(
  categories: string[],
  slotPieYears: Partial<Record<number, string>> | undefined,
  slot: number,
): string | null {
  const years = extractYearsFromCategories(categories);
  if (years.length === 0) return null;
  const picked = slotPieYears?.[slot]?.trim();
  if (picked && years.includes(picked)) return picked;
  return years[0] ?? null;
}

export function resolveSlotSeasonalYearCount(
  slotSeasonalYearCount: Partial<Record<number, number>> | undefined,
  slot: number,
): number {
  const raw = slotSeasonalYearCount?.[slot];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(2, Math.min(15, Math.floor(raw)));
  }
  return DEFAULT_SEASONAL_YEAR_COUNT;
}

type SeasonalFreq = "month" | "quarter";

function detectSeasonalFreq(categories: string[]): SeasonalFreq | null {
  let sawMonth = false;
  let sawDaily = false;
  let sawQuarter = false;
  for (const cat of categories) {
    const s = cat.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) sawDaily = true;
    else if (/^\d{4}-\d{2}$/.test(s)) sawMonth = true;
    else if (/^\d{4}-Q[1-4]$/i.test(s)) sawQuarter = true;
  }
  if (sawQuarter && !sawMonth && !sawDaily) return "quarter";
  if (sawMonth || sawDaily) return "month";
  return null;
}

function parseSeasonalPeriod(
  category: string,
  freq: SeasonalFreq,
): { year: string; period: number } | null {
  const s = category.trim();
  if (freq === "month") {
    const daily = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (daily) {
      const period = Number(daily[2]);
      if (period < 1 || period > 12) return null;
      return { year: daily[1]!, period };
    }
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return null;
    const period = Number(m[2]);
    if (period < 1 || period > 12) return null;
    return { year: m[1]!, period };
  }
  const q = /^(\d{4})-Q([1-4])$/i.exec(s);
  if (!q) return null;
  return { year: q[1]!, period: Number(q[2]) };
}

/** 季节图无法渲染时的具体原因（用于 UI 提示，避免误报「请保留 1 个指标」） */
export function describeSeasonalChartEmptyReason(
  slice: MacroChartSlice | null | undefined,
  _yearCount?: number,
): string {
  if (!slice?.series?.length) {
    return "此图暂无序列，请拖入一个指标";
  }
  if (slice.series.length > 1) {
    return "季节图仅支持 1 个指标，请将其余指标移到待选集";
  }
  const freq = detectSeasonalFreq(slice.categories);
  if (!freq) {
    return "季节图需要月度或季度横轴（如 2024-01、2024-01-31、2024-Q1）；当前日期格式不支持";
  }
  const series0 = slice.series[0]!;
  let hasPoint = false;
  for (let i = 0; i < slice.categories.length; i++) {
    if (!parseSeasonalPeriod(slice.categories[i] ?? "", freq)) continue;
    const raw = series0.data[i];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      hasPoint = true;
      break;
    }
  }
  if (!hasPoint) {
    return "当前指标无有效数值，请换指标或检查数据";
  }
  return "无法生成季节图，请检查数据";
}

function seasonalPeriodLabels(freq: SeasonalFreq): string[] {
  if (freq === "month") {
    return Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
  }
  return ["Q1", "Q2", "Q3", "Q4"];
}

function collectFiniteSeriesValues(series: NonNullable<EChartsOption["series"]>): number[] {
  const values: number[] = [];
  const list = Array.isArray(series) ? series : [series];
  for (const s of list) {
    if (!s || typeof s !== "object" || !("data" in s)) continue;
    const data = (s as { data?: unknown }).data;
    if (!Array.isArray(data)) continue;
    for (const v of data) {
      if (typeof v === "number" && Number.isFinite(v)) values.push(v);
    }
  }
  return values;
}

/** 季节图 Y 轴：按实际数值留白，避免从 0 起算把波动压扁 */
function computeSeasonalYExtent(
  series: NonNullable<EChartsOption["series"]>,
): { min: number; max: number } | null {
  const values = collectFiniteSeriesValues(series);
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const pad =
    span > 0
      ? span * 0.12
      : Math.max(Math.abs(hi) * 0.05, 1);
  return { min: lo - pad, max: hi + pad };
}

const SEASONAL_YEAR_COLORS = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#38bdf8",
  "#4ade80",
  "#e879f9",
  "#f87171",
  "#94a3b8",
  "#2dd4bf",
  "#c084fc",
  "#fcd34d",
  "#86efac",
];

export function macroSliceToSeasonalChartOption(
  slice: MacroChartSlice,
  yearCount: number,
  opts?: {
    compact?: boolean;
    seriesVisualMap?: MacroSeriesVisualConfigMap;
    displayConfig?: MacroChartDisplayConfig;
    axisRanges?: MacroSlotAxisRanges;
  },
): EChartsOption | null {
  const series0 = slice.series[0];
  if (!series0) return null;

  const freq = detectSeasonalFreq(slice.categories);
  if (!freq) return null;

  const periodCount = freq === "month" ? 12 : 4;
  const periodLabels = seasonalPeriodLabels(freq);
  const byYear = new Map<string, Array<number | null>>();

  for (let i = 0; i < slice.categories.length; i++) {
    const parsed = parseSeasonalPeriod(slice.categories[i] ?? "", freq);
    if (!parsed) continue;
    const raw = series0.data[i];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    let row = byYear.get(parsed.year);
    if (!row) {
      row = Array.from({ length: periodCount }, () => null);
      byYear.set(parsed.year, row);
    }
    row[parsed.period - 1] = value;
  }

  const allYears = [...byYear.keys()].sort((a, b) => a.localeCompare(b));
  if (allYears.length === 0) return null;

  const n = Math.max(2, Math.min(15, Math.floor(yearCount)));
  const selectedYears = allYears.slice(-n);
  const avgYears = selectedYears.slice(0, -1);

  const visualMap = opts?.seriesVisualMap ?? {};
  const display = { ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG, ...(opts?.displayConfig ?? {}) };
  const compact = opts?.compact ?? false;
  const cfg = visualMap[series0.key ?? series0.name] ?? {};
  const baseColor = cfg.color ?? "#64748b";
  const lineWidth = Math.max(0.5, cfg.lineWidth ?? display.lineWidth);

  const chartSeries: NonNullable<EChartsOption["series"]> = selectedYears.map((year, yi) => {
    const row = byYear.get(year) ?? Array.from({ length: periodCount }, () => null);
    const isLatest = yi === selectedYears.length - 1;
    const color = SEASONAL_YEAR_COLORS[yi % SEASONAL_YEAR_COLORS.length] ?? baseColor;
    return {
      name: `${year}年`,
      type: "line" as const,
      connectNulls: true,
      showSymbol: display.showSymbols,
      symbolSize: Math.max(2, cfg.symbolSize ?? display.symbolSize),
      smooth: display.lineSmooth,
      lineStyle: {
        color,
        width: isLatest ? Math.max(lineWidth, 2.2) : lineWidth,
      },
      itemStyle: { color },
      data: row,
    };
  });

  if (avgYears.length > 0) {
    const avgData = Array.from({ length: periodCount }, (_, pi) => {
      const vals: number[] = [];
      for (const year of avgYears) {
        const v = byYear.get(year)?.[pi];
        if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
      }
      if (vals.length === 0) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    chartSeries.push({
      name: `前${avgYears.length}年均值`,
      type: "line",
      connectNulls: true,
      showSymbol: false,
      smooth: display.lineSmooth,
      lineStyle: {
        color: "#f59e0b",
        width: Math.max(lineWidth, 2),
        type: "dashed",
      },
      itemStyle: { color: "#f59e0b" },
      data: avgData,
    });
  }

  const axisRanges = opts?.axisRanges;
  const autoLeftExtent = computeSeasonalYExtent(chartSeries);
  const leftExtent =
    resolveAppliedAxisExtent(axisRanges?.left, autoLeftExtent) ??
    (autoLeftExtent
      ? { ...normalizeMacroAxisExtent(autoLeftExtent), scale: true as const }
      : null);
  const titleText = slice.title?.trim() || undefined;

  return {
    title: titleText
      ? {
          text: titleText,
          left: "center",
          textStyle: {
            color: "#cbd5e1",
            fontSize: compact ? 11 : 13,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: "#cbd5e1", fontSize: compact ? 11 : 12 },
    tooltip: display.showTooltip
      ? {
          trigger: "axis",
          textStyle: { fontSize: compact ? 10 : 12 },
          valueFormatter: (value) => formatMacroDisplayValue(value),
        }
      : { show: false },
    legend: display.showLegend
      ? {
          type: chartSeries.length > 6 ? "scroll" : "plain",
          data: chartSeries.map((s) => (typeof s === "object" && s && "name" in s ? String(s.name) : "")),
          textStyle: { color: "#94a3b8", fontSize: compact ? 10 : 11 },
          ...(display.legendPosition === "top"
            ? { top: compact ? 2 : 4 }
            : { bottom: compact ? 2 : 4 }),
          width: "92%",
          left: "center",
        }
      : { show: false },
    grid: {
      left: compact ? 44 : 56,
      right: compact ? 26 : 32,
      top: compact ? 40 : 56,
      bottom: compact ? 48 : 62,
    },
    xAxis: {
      type: "category",
      data: periodLabels,
      boundaryGap: false,
      axisLabel: { color: "#94a3b8", fontSize: display.xLabelFontSize },
    },
    yAxis: {
      type: "value",
      ...(leftExtent ? { min: leftExtent.min, max: leftExtent.max, scale: true } : { scale: true }),
      splitLine: display.showGridLines ? { lineStyle: { color: "#1e293b" } } : { show: false },
      axisLabel: macroValueAxisLabel(display.yLabelFontSize),
    },
    series: chartSeries,
  };
}

export function macroSliceToPieChartOption(
  slice: MacroChartSlice,
  year: string,
  opts?: {
    compact?: boolean;
    seriesVisualMap?: MacroSeriesVisualConfigMap;
    displayConfig?: MacroChartDisplayConfig;
  },
): EChartsOption | null {
  const idx = lastCategoryIndexForYear(slice.categories, year);
  if (idx < 0) return null;

  const visualMap = opts?.seriesVisualMap ?? {};
  const display = { ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG, ...(opts?.displayConfig ?? {}) };
  const compact = opts?.compact ?? false;

  const data = slice.series
    .map((s) => {
      const k = s.key ?? s.name;
      const raw = s.data[idx];
      const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      if (value === null || value === 0) return null;
      const cfg = visualMap[k];
      return {
        name: s.name,
        value: Math.abs(value),
        ...(cfg?.color ? { itemStyle: { color: cfg.color } } : {}),
      };
    })
    .filter((x): x is { name: string; value: number; itemStyle?: { color: string } } => x !== null);

  if (data.length === 0) return null;

  const titleText = slice.title ? `${slice.title}（${year}年）` : null;

  return {
    title: titleText
      ? {
          text: titleText,
          left: "center",
          textStyle: {
            color: "#cbd5e1",
            fontSize: compact ? 11 : 13,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: "#cbd5e1", fontSize: compact ? 11 : 12 },
    tooltip: display.showTooltip
      ? {
          trigger: "item",
          textStyle: { fontSize: compact ? 10 : 12 },
          formatter: (params) => {
            const p = params as { name?: string; value?: number; percent?: number };
            const v = formatMacroDisplayValue(p.value);
            const pct =
              typeof p.percent === "number" && Number.isFinite(p.percent)
                ? p.percent.toFixed(1)
                : "";
            return pct ? `${p.name ?? ""}: ${v} (${pct}%)` : `${p.name ?? ""}: ${v}`;
          },
        }
      : { show: false },
    legend: display.showLegend
      ? {
          type: data.length > 6 ? "scroll" : "plain",
          orient: "vertical",
          left: compact ? 4 : 8,
          top: "middle",
          textStyle: { color: "#94a3b8", fontSize: compact ? 10 : 11 },
        }
      : { show: false },
    series: [
      {
        name: titleText ?? `${year}年`,
        type: "pie",
        radius: compact ? ["32%", "58%"] : ["38%", "66%"],
        center: display.showLegend ? ["58%", "52%"] : ["50%", "52%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 4,
          borderColor: "#0f172a",
          borderWidth: 1,
        },
        label: {
          color: "#cbd5e1",
          fontSize: compact ? 10 : 11,
          formatter: "{b}\n{d}%",
        },
        emphasis: {
          label: { fontSize: compact ? 11 : 12, fontWeight: "bold" },
        },
        data,
      },
    ],
  };
}

export function macroPayloadToChartOption(
  slice: MacroChartSlice,
  opts?: {
    compact?: boolean;
    seriesVisualMap?: MacroSeriesVisualConfigMap;
    displayConfig?: MacroChartDisplayConfig;
    axisRanges?: MacroSlotAxisRanges;
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
  const axisRanges = opts?.axisRanges;
  const autoLeftExtent = computeAxisExtentFromSlice(slice, visualMap, "left");
  const autoRightExtent = hasRightAxis
    ? computeAxisExtentFromSlice(slice, visualMap, "right")
    : null;
  const leftApplied = resolveAppliedAxisExtent(axisRanges?.left, autoLeftExtent);
  const rightApplied = hasRightAxis
    ? resolveAppliedAxisExtent(axisRanges?.right, autoRightExtent)
    : null;

  const yAxis: EChartsOption["yAxis"] = [
    {
      type: "value",
      position: "left",
      ...(leftApplied ? { min: leftApplied.min, max: leftApplied.max, scale: true } : {}),
      splitLine: display.showGridLines ? { lineStyle: { color: "#1e293b" } } : { show: false },
      axisLabel: macroValueAxisLabel(display.yLabelFontSize),
    },
    ...(hasRightAxis
      ? [
          {
            type: "value" as const,
            position: "right" as const,
            ...(rightApplied ? { min: rightApplied.min, max: rightApplied.max, scale: true } : {}),
            splitLine: { show: false },
            axisLabel: macroValueAxisLabel(display.yLabelFontSize),
          },
        ]
      : []),
  ];

  function endLabelFor(cfg: MacroSeriesVisualConfig) {
    if (!cfg.showEndLabel) return undefined;
    return {
      show: true,
      formatter: (params: { value?: unknown }) => formatMacroDisplayValue(params?.value),
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
          valueFormatter: (value) => formatMacroDisplayValue(value),
          axisPointer: {
            type: "cross",
            crossStyle: { color: "#64748b", width: 1 },
            label: {
              color: "#e2e8f0",
              backgroundColor: "#334155",
              fontSize: compact ? 10 : 12,
              padding: compact ? [2, 4] : [3, 6],
              formatter: (params: { value?: string | number }) => {
                const v = params.value;
                if (typeof v === "number") return formatMacroDisplayNumber(v);
                if (typeof v === "string" && /^-?\d/.test(v.trim())) {
                  return formatMacroDisplayValue(v);
                }
                return v == null ? "" : String(v);
              },
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
      const showSymbol = display.showSymbols;
      const smooth = display.lineSmooth;
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
