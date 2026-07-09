import type { EChartsOption } from "echarts";
import type { MacroPayload } from "@/lib/data/types";
import { formatMacroDisplayNumber, formatMacroDisplayValue, normalizeMacroAxisExtent } from "@/lib/formatMacroValue";
import { CHART, SITE } from "@/lib/siteTheme";

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
export type MacroChartSlotMode =
  | "timeSeries"
  | "pie"
  | "seasonal"
  | "waterfall"
  | "heatmap"
  | "xyScatter"
  | "boxplot"
  | "radar";

export const DEFAULT_SEASONAL_YEAR_COUNT = 5;

/** 非时序槽位：禁用画线、十字准星联动，并使用全样本（非缩放窗口） */
export function isAltMacroSlotMode(mode: MacroChartSlotMode): boolean {
  return mode !== "timeSeries";
}

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
  /** 瀑布图各槽使用的年份 */
  slotWaterfallYears?: Partial<Record<number, string>>;
  /** 雷达图各槽使用的年份 */
  slotRadarYears?: Partial<Record<number, string>>;
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
    color: CHART.muted,
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

export function resolveSlotSnapshotYear(
  categories: string[],
  slotYears: Partial<Record<number, string>> | undefined,
  slot: number,
): string | null {
  const years = extractYearsFromCategories(categories);
  if (years.length === 0) return null;
  const picked = slotYears?.[slot]?.trim();
  if (picked && years.includes(picked)) return picked;
  return years[0] ?? null;
}

export function resolveSlotPieYear(
  categories: string[],
  slotPieYears: Partial<Record<number, string>> | undefined,
  slot: number,
): string | null {
  return resolveSlotSnapshotYear(categories, slotPieYears, slot);
}

export function resolveSlotWaterfallYear(
  categories: string[],
  slotWaterfallYears: Partial<Record<number, string>> | undefined,
  slot: number,
): string | null {
  return resolveSlotSnapshotYear(categories, slotWaterfallYears, slot);
}

export function resolveSlotRadarYear(
  categories: string[],
  slotRadarYears: Partial<Record<number, string>> | undefined,
  slot: number,
): string | null {
  return resolveSlotSnapshotYear(categories, slotRadarYears, slot);
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
  const baseColor = cfg.color ?? CHART.seriesDefault;
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
            color: CHART.text,
            fontSize: compact ? 11 : 13,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: CHART.text, fontSize: compact ? 11 : 12 },
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
          textStyle: { color: CHART.muted, fontSize: compact ? 10 : 11 },
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
      axisLabel: { color: CHART.muted, fontSize: display.xLabelFontSize },
    },
    yAxis: {
      type: "value",
      ...(leftExtent ? { min: leftExtent.min, max: leftExtent.max, scale: true } : { scale: true }),
      splitLine: display.showGridLines ? { lineStyle: { color: CHART.grid } } : { show: false },
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
            color: CHART.text,
            fontSize: compact ? 11 : 13,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: CHART.text, fontSize: compact ? 11 : 12 },
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
          textStyle: { color: CHART.muted, fontSize: compact ? 10 : 11 },
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
          borderColor: SITE.bg,
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

function finiteNumbers(data: Array<number | null | undefined>): number[] {
  const out: number[] = [];
  for (const v of data) {
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  const w = pos - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]!;
    sumY += ys[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (!(den > 0)) return null;
  const r = num / den;
  if (!Number.isFinite(r)) return null;
  return Math.max(-1, Math.min(1, r));
}

function linearRegression(
  points: Array<[number, number]>,
): { slope: number; intercept: number; x0: number; x1: number } | null {
  if (points.length < 2) return null;
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
  }
  const n = points.length;
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    const dx = x - meanX;
    num += dx * (y - meanY);
    den += dx * dx;
  }
  if (!(den > 0)) return null;
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  let x0 = points[0]![0];
  let x1 = points[0]![0];
  for (const [x] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  if (x0 === x1) return null;
  return { slope, intercept, x0, x1 };
}

function seriesColorAt(
  visualMap: MacroSeriesVisualConfigMap,
  series: MacroChartSlice["series"][number],
  fallbackIndex: number,
): string {
  const k = series.key ?? series.name;
  return visualMap[k]?.color ?? SEASONAL_YEAR_COLORS[fallbackIndex % SEASONAL_YEAR_COLORS.length]!;
}

export function describeWaterfallChartEmptyReason(slice: MacroChartSlice | null | undefined): string {
  if (!slice?.series?.length) return "瀑布图至少需要 2 个指标（起点 + 增减项）";
  if (slice.series.length < 2) return "瀑布图至少需要 2 个指标（起点 + 增减项）";
  return "当前年份暂无可用数据，请换一年份或检查指标数值";
}

export function describeHeatmapChartEmptyReason(slice: MacroChartSlice | null | undefined): string {
  if (!slice?.series?.length) return "热力图至少需要 2 个指标";
  if (slice.series.length < 2) return "热力图至少需要 2 个指标";
  return "指标之间有效重叠样本不足，无法计算相关矩阵";
}

export function describeXyScatterChartEmptyReason(slice: MacroChartSlice | null | undefined): string {
  if (!slice?.series?.length) return "XY 散点需要恰好 2 个指标（第 1 个为 X，第 2 个为 Y）";
  if (slice.series.length !== 2) return "XY 散点需要恰好 2 个指标（第 1 个为 X，第 2 个为 Y）";
  return "两指标无共同有效日期，无法绘制散点";
}

export function describeBoxplotChartEmptyReason(slice: MacroChartSlice | null | undefined): string {
  if (!slice?.series?.length) return "箱线图至少需要 1 个指标";
  return "当前指标无有效数值，请换指标或检查数据";
}

export function describeRadarChartEmptyReason(slice: MacroChartSlice | null | undefined): string {
  if (!slice?.series?.length) return "雷达图至少需要 3 个指标";
  if (slice.series.length < 3) return "雷达图至少需要 3 个指标";
  return "当前年份暂无可用数据，请换一年份或检查指标数值";
}

/** 瀑布图：槽内顺序为首项起点、中间增减、末项合计（自动汇总） */
export function macroSliceToWaterfallChartOption(
  slice: MacroChartSlice,
  year: string,
  opts?: {
    compact?: boolean;
    seriesVisualMap?: MacroSeriesVisualConfigMap;
    displayConfig?: MacroChartDisplayConfig;
  },
): EChartsOption | null {
  if (slice.series.length < 2) return null;
  const idx = lastCategoryIndexForYear(slice.categories, year);
  if (idx < 0) return null;

  const visualMap = opts?.seriesVisualMap ?? {};
  const display = { ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG, ...(opts?.displayConfig ?? {}) };
  const compact = opts?.compact ?? false;

  const values: Array<{ name: string; value: number; color?: string }> = [];
  for (let i = 0; i < slice.series.length; i++) {
    const s = slice.series[i]!;
    const raw = s.data[idx];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    values.push({
      name: s.name,
      value: raw,
      color: seriesColorAt(visualMap, s, i),
    });
  }
  if (values.length < 2) return null;

  const n = values.length;
  const help: number[] = [];
  const positive: Array<number | "-"> = [];
  const negative: Array<number | "-"> = [];
  let running = 0;

  for (let i = 0; i < n; i++) {
    const v = values[i]!.value;
    const isLast = i === n - 1;
    if (i === 0) {
      help.push(0);
      if (v >= 0) {
        positive.push(v);
        negative.push("-");
      } else {
        positive.push("-");
        negative.push(-v);
      }
      running = v;
    } else if (isLast) {
      // 末项显示为合计柱（从 0 到累计值），忽略其原始值
      help.push(0);
      if (running >= 0) {
        positive.push(running);
        negative.push("-");
      } else {
        positive.push("-");
        negative.push(-running);
      }
    } else {
      if (v >= 0) {
        help.push(running);
        positive.push(v);
        negative.push("-");
        running += v;
      } else {
        help.push(running + v);
        positive.push("-");
        negative.push(-v);
        running += v;
      }
    }
  }

  const categories = values.map((v, i) => (i === n - 1 ? `${v.name}（合计）` : v.name));
  const titleText = slice.title ? `${slice.title}（${year}年）` : undefined;

  return {
    title: titleText
      ? {
          text: titleText,
          left: "center",
          textStyle: {
            color: CHART.text,
            fontSize: compact ? 11 : 13,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: CHART.text, fontSize: compact ? 11 : 12 },
    tooltip: display.showTooltip
      ? {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          textStyle: { fontSize: compact ? 10 : 12 },
          formatter: (params) => {
            const list = Array.isArray(params) ? params : [params];
            const name = (list[0] as { name?: string } | undefined)?.name ?? "";
            let delta = 0;
            for (const p of list) {
              const item = p as { seriesName?: string; value?: number | string };
              if (item.seriesName === "辅助") continue;
              const v = typeof item.value === "number" ? item.value : Number(item.value);
              if (Number.isFinite(v)) delta += item.seriesName === "减少" ? -v : v;
            }
            return `${name}<br/>${formatMacroDisplayValue(delta)}`;
          },
        }
      : { show: false },
    legend: { show: false },
    grid: {
      left: compact ? 48 : 60,
      right: compact ? 20 : 28,
      top: compact ? 40 : 56,
      bottom: compact ? 52 : 68,
    },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: {
        color: CHART.muted,
        fontSize: display.xLabelFontSize,
        rotate: display.xLabelRotate,
        interval: 0,
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      splitLine: display.showGridLines ? { lineStyle: { color: CHART.grid } } : { show: false },
      axisLabel: macroValueAxisLabel(display.yLabelFontSize),
    },
    series: [
      {
        name: "辅助",
        type: "bar",
        stack: "waterfall",
        silent: true,
        itemStyle: { borderColor: "transparent", color: "transparent" },
        emphasis: { itemStyle: { borderColor: "transparent", color: "transparent" } },
        data: help,
      },
      {
        name: "增加",
        type: "bar",
        stack: "waterfall",
        barMaxWidth: display.barMaxWidth,
        itemStyle: { color: "#34d399" },
        data: positive,
        label: {
          show: true,
          position: "top",
          color: CHART.muted,
          fontSize: compact ? 9 : 10,
          formatter: (p) => {
            const raw = (p as { value?: unknown }).value;
            const v = typeof raw === "number" ? raw : Number(raw);
            return Number.isFinite(v) && v !== 0 ? formatMacroDisplayNumber(v) : "";
          },
        },
      },
      {
        name: "减少",
        type: "bar",
        stack: "waterfall",
        barMaxWidth: display.barMaxWidth,
        itemStyle: { color: "#f87171" },
        data: negative,
        label: {
          show: true,
          position: "bottom",
          color: CHART.muted,
          fontSize: compact ? 9 : 10,
          formatter: (p) => {
            const raw = (p as { value?: unknown }).value;
            const v = typeof raw === "number" ? raw : Number(raw);
            return Number.isFinite(v) && v !== 0 ? formatMacroDisplayNumber(-v) : "";
          },
        },
      },
    ] as EChartsOption["series"],
  };
}

/** 热力图：槽内指标两两 Pearson 相关矩阵 */
export function macroSliceToHeatmapChartOption(
  slice: MacroChartSlice,
  opts?: {
    compact?: boolean;
    seriesVisualMap?: MacroSeriesVisualConfigMap;
    displayConfig?: MacroChartDisplayConfig;
  },
): EChartsOption | null {
  if (slice.series.length < 2) return null;
  const display = { ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG, ...(opts?.displayConfig ?? {}) };
  const compact = opts?.compact ?? false;
  const names = slice.series.map((s) => s.name);
  const n = names.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  let hasAny = false;

  for (let i = 0; i < n; i++) {
    matrix[i]![i] = 1;
    for (let j = i + 1; j < n; j++) {
      const xs: number[] = [];
      const ys: number[] = [];
      const a = slice.series[i]!.data;
      const b = slice.series[j]!.data;
      const len = Math.min(a.length, b.length, slice.categories.length);
      for (let k = 0; k < len; k++) {
        const xv = a[k];
        const yv = b[k];
        if (typeof xv === "number" && Number.isFinite(xv) && typeof yv === "number" && Number.isFinite(yv)) {
          xs.push(xv);
          ys.push(yv);
        }
      }
      const r = pearsonCorrelation(xs, ys);
      if (r == null) {
        matrix[i]![j] = NaN;
        matrix[j]![i] = NaN;
      } else {
        hasAny = true;
        matrix[i]![j] = r;
        matrix[j]![i] = r;
      }
    }
  }
  if (!hasAny && n > 1) return null;

  const data: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = matrix[i]![j]!;
      if (Number.isFinite(v)) data.push([j, i, Number(v.toFixed(3))]);
    }
  }
  if (data.length === 0) return null;

  const titleText = slice.title?.trim() || undefined;

  return {
    title: titleText
      ? {
          text: titleText,
          left: "center",
          textStyle: {
            color: CHART.text,
            fontSize: compact ? 11 : 13,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: CHART.text, fontSize: compact ? 11 : 12 },
    tooltip: display.showTooltip
      ? {
          position: "top",
          textStyle: { fontSize: compact ? 10 : 12 },
          formatter: (params) => {
            const p = params as { value?: [number, number, number] };
            const v = p.value;
            if (!v) return "";
            const xName = names[v[0]] ?? "";
            const yName = names[v[1]] ?? "";
            return `${yName} × ${xName}<br/>r = ${v[2]}`;
          },
        }
      : { show: false },
    grid: {
      left: compact ? 72 : 96,
      right: compact ? 48 : 64,
      top: compact ? 44 : 60,
      bottom: compact ? 56 : 72,
    },
    xAxis: {
      type: "category",
      data: names,
      splitArea: { show: true },
      axisLabel: {
        color: CHART.muted,
        fontSize: Math.max(9, display.xLabelFontSize - 1),
        rotate: 30,
        interval: 0,
      },
    },
    yAxis: {
      type: "category",
      data: names,
      splitArea: { show: true },
      axisLabel: {
        color: CHART.muted,
        fontSize: Math.max(9, display.yLabelFontSize - 1),
      },
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: "vertical",
      right: compact ? 4 : 8,
      top: "middle",
      textStyle: { color: CHART.muted, fontSize: compact ? 9 : 10 },
      inRange: {
        color: ["#3b82f6", "#e2e8f0", "#ef4444"],
      },
    },
    series: [
      {
        name: "相关系数",
        type: "heatmap",
        data,
        label: {
          show: n <= 8,
          color: CHART.text,
          fontSize: compact ? 9 : 10,
        },
        emphasis: {
          itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.35)" },
        },
      },
    ],
  };
}

/** XY 相关散点：槽内第 1 指标为 X、第 2 为 Y，叠加回归线 */
export function macroSliceToXyScatterChartOption(
  slice: MacroChartSlice,
  opts?: {
    compact?: boolean;
    seriesVisualMap?: MacroSeriesVisualConfigMap;
    displayConfig?: MacroChartDisplayConfig;
  },
): EChartsOption | null {
  if (slice.series.length !== 2) return null;
  const sx = slice.series[0]!;
  const sy = slice.series[1]!;
  const visualMap = opts?.seriesVisualMap ?? {};
  const display = { ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG, ...(opts?.displayConfig ?? {}) };
  const compact = opts?.compact ?? false;

  const points: Array<[number, number]> = [];
  const len = Math.min(sx.data.length, sy.data.length, slice.categories.length);
  for (let i = 0; i < len; i++) {
    const x = sx.data[i];
    const y = sy.data[i];
    if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) {
      points.push([x, y]);
    }
  }
  if (points.length === 0) return null;

  const color = seriesColorAt(visualMap, sy, 1);
  const reg = linearRegression(points);
  const titleText = slice.title?.trim() || undefined;
  const seriesList: NonNullable<EChartsOption["series"]> = [
    {
      name: `${sy.name} vs ${sx.name}`,
      type: "scatter",
      symbolSize: Math.max(4, display.symbolSize),
      itemStyle: { color, opacity: 0.75 },
      data: points,
    },
  ];
  if (reg) {
    seriesList.push({
      name: "回归线",
      type: "line",
      showSymbol: false,
      lineStyle: { color: "#f59e0b", width: 1.6, type: "dashed" },
      data: [
        [reg.x0, reg.slope * reg.x0 + reg.intercept],
        [reg.x1, reg.slope * reg.x1 + reg.intercept],
      ],
      tooltip: { show: false },
    });
  }

  return {
    title: titleText
      ? {
          text: titleText,
          left: "center",
          textStyle: {
            color: CHART.text,
            fontSize: compact ? 11 : 13,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: CHART.text, fontSize: compact ? 11 : 12 },
    tooltip: display.showTooltip
      ? {
          trigger: "item",
          textStyle: { fontSize: compact ? 10 : 12 },
          formatter: (params) => {
            const p = params as { seriesType?: string; value?: [number, number] };
            if (p.seriesType !== "scatter" || !p.value) return "";
            return `${sx.name}: ${formatMacroDisplayValue(p.value[0])}<br/>${sy.name}: ${formatMacroDisplayValue(p.value[1])}`;
          },
        }
      : { show: false },
    legend: display.showLegend
      ? {
          data: seriesList.map((s) => (typeof s === "object" && s && "name" in s ? String(s.name) : "")),
          textStyle: { color: CHART.muted, fontSize: compact ? 10 : 11 },
          ...(display.legendPosition === "top"
            ? { top: compact ? 2 : 4 }
            : { bottom: compact ? 2 : 4 }),
        }
      : { show: false },
    grid: {
      left: compact ? 52 : 64,
      right: compact ? 24 : 32,
      top: compact ? 44 : 56,
      bottom: compact ? 52 : 64,
    },
    xAxis: {
      type: "value",
      name: sx.name,
      nameLocation: "middle",
      nameGap: compact ? 22 : 28,
      nameTextStyle: { color: CHART.muted, fontSize: compact ? 10 : 11 },
      scale: true,
      splitLine: display.showGridLines ? { lineStyle: { color: CHART.grid } } : { show: false },
      axisLabel: macroValueAxisLabel(display.xLabelFontSize),
    },
    yAxis: {
      type: "value",
      name: sy.name,
      nameTextStyle: { color: CHART.muted, fontSize: compact ? 10 : 11 },
      scale: true,
      splitLine: display.showGridLines ? { lineStyle: { color: CHART.grid } } : { show: false },
      axisLabel: macroValueAxisLabel(display.yLabelFontSize),
    },
    series: seriesList,
  };
}

/** 箱线图：各序列全样本五数概括 */
export function macroSliceToBoxplotChartOption(
  slice: MacroChartSlice,
  opts?: {
    compact?: boolean;
    seriesVisualMap?: MacroSeriesVisualConfigMap;
    displayConfig?: MacroChartDisplayConfig;
  },
): EChartsOption | null {
  if (slice.series.length < 1) return null;
  const visualMap = opts?.seriesVisualMap ?? {};
  const display = { ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG, ...(opts?.displayConfig ?? {}) };
  const compact = opts?.compact ?? false;

  const categories: string[] = [];
  const boxData: number[][] = [];
  const colors: string[] = [];

  for (let i = 0; i < slice.series.length; i++) {
    const s = slice.series[i]!;
    const vals = finiteNumbers(s.data).sort((a, b) => a - b);
    if (vals.length === 0) continue;
    const min = vals[0]!;
    const q1 = quantileSorted(vals, 0.25);
    const median = quantileSorted(vals, 0.5);
    const q3 = quantileSorted(vals, 0.75);
    const max = vals[vals.length - 1]!;
    categories.push(s.name);
    boxData.push([min, q1, median, q3, max]);
    colors.push(seriesColorAt(visualMap, s, i));
  }
  if (boxData.length === 0) return null;

  const titleText = slice.title?.trim() || undefined;

  return {
    title: titleText
      ? {
          text: titleText,
          left: "center",
          textStyle: {
            color: CHART.text,
            fontSize: compact ? 11 : 13,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: CHART.text, fontSize: compact ? 11 : 12 },
    tooltip: display.showTooltip
      ? {
          trigger: "item",
          textStyle: { fontSize: compact ? 10 : 12 },
          formatter: (params) => {
            const p = params as { name?: string; value?: number[] };
            const v = p.value;
            if (!v || v.length < 5) return p.name ?? "";
            return [
              p.name ?? "",
              `最小: ${formatMacroDisplayValue(v[0])}`,
              `Q1: ${formatMacroDisplayValue(v[1])}`,
              `中位: ${formatMacroDisplayValue(v[2])}`,
              `Q3: ${formatMacroDisplayValue(v[3])}`,
              `最大: ${formatMacroDisplayValue(v[4])}`,
            ].join("<br/>");
          },
        }
      : { show: false },
    grid: {
      left: compact ? 48 : 60,
      right: compact ? 20 : 28,
      top: compact ? 40 : 56,
      bottom: compact ? 52 : 68,
    },
    xAxis: {
      type: "category",
      data: categories,
      boundaryGap: true,
      axisLabel: {
        color: CHART.muted,
        fontSize: display.xLabelFontSize,
        rotate: display.xLabelRotate,
        interval: 0,
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      splitLine: display.showGridLines ? { lineStyle: { color: CHART.grid } } : { show: false },
      axisLabel: macroValueAxisLabel(display.yLabelFontSize),
    },
    series: [
      {
        name: "箱线",
        type: "boxplot",
        data: boxData.map((row, i) => ({
          value: row,
          itemStyle: {
            color: "transparent",
            borderColor: colors[i] ?? CHART.seriesDefault,
            borderWidth: 1.5,
          },
        })),
      },
    ],
  };
}

/** 雷达图：选定年份截面，各轴按序列历史 min-max 归一化到 0–100 */
export function macroSliceToRadarChartOption(
  slice: MacroChartSlice,
  year: string,
  opts?: {
    compact?: boolean;
    seriesVisualMap?: MacroSeriesVisualConfigMap;
    displayConfig?: MacroChartDisplayConfig;
  },
): EChartsOption | null {
  if (slice.series.length < 3) return null;
  const idx = lastCategoryIndexForYear(slice.categories, year);
  if (idx < 0) return null;

  const visualMap = opts?.seriesVisualMap ?? {};
  const display = { ...DEFAULT_MACRO_CHART_DISPLAY_CONFIG, ...(opts?.displayConfig ?? {}) };
  const compact = opts?.compact ?? false;

  const indicators: Array<{ name: string; max: number }> = [];
  const values: number[] = [];
  const usedSeries: MacroChartSlice["series"] = [];

  for (const s of slice.series) {
    const raw = s.data[idx];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const hist = finiteNumbers(s.data);
    if (hist.length === 0) continue;
    const lo = Math.min(...hist);
    const hi = Math.max(...hist);
    const span = hi - lo;
    const norm = span > 0 ? ((raw - lo) / span) * 100 : 50;
    indicators.push({ name: s.name, max: 100 });
    values.push(Number(norm.toFixed(1)));
    usedSeries.push(s);
  }
  if (indicators.length < 3) return null;

  const color = seriesColorAt(visualMap, usedSeries[0]!, 0);
  const titleText = slice.title ? `${slice.title}（${year}年）` : undefined;

  return {
    title: titleText
      ? {
          text: titleText,
          left: "center",
          textStyle: {
            color: CHART.text,
            fontSize: compact ? 11 : 13,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: CHART.text, fontSize: compact ? 11 : 12 },
    tooltip: display.showTooltip
      ? {
          trigger: "item",
          textStyle: { fontSize: compact ? 10 : 12 },
        }
      : { show: false },
    legend: { show: false },
    radar: {
      indicator: indicators,
      center: ["50%", "55%"],
      radius: compact ? "58%" : "62%",
      axisName: {
        color: CHART.muted,
        fontSize: compact ? 9 : 10,
      },
      splitLine: { lineStyle: { color: CHART.grid } },
      splitArea: {
        show: true,
        areaStyle: { color: ["rgba(148,163,184,0.04)", "rgba(148,163,184,0.08)"] },
      },
      axisLine: { lineStyle: { color: CHART.grid } },
    },
    series: [
      {
        name: `${year}年`,
        type: "radar",
        data: [
          {
            value: values,
            name: `${year}年`,
            areaStyle: { color, opacity: 0.2 },
            lineStyle: { color, width: 1.8 },
            itemStyle: { color },
          },
        ],
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
      splitLine: display.showGridLines ? { lineStyle: { color: CHART.grid } } : { show: false },
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
      color: cfg.color ?? CHART.text,
      backgroundColor: CHART.endLabelBg,
      borderColor: cfg.color ?? CHART.seriesDefault,
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
            color: CHART.text,
            fontSize: titleSize,
            fontWeight: "normal",
          },
        }
      : undefined,
    backgroundColor: "transparent",
    textStyle: { color: CHART.text, fontSize: compact ? 11 : 12 },
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
            crossStyle: { color: CHART.crosshair, width: 1 },
            label: {
              color: CHART.tooltipText,
              backgroundColor: CHART.tooltipBg,
              fontSize: compact ? 10 : 12,
              padding: compact ? [2, 4] : [3, 6],
              formatter: (params) => {
                const v = params.value;
                if (typeof v === "number") return formatMacroDisplayNumber(v);
                if (typeof v === "string" && /^-?\d/.test(v.trim())) {
                  return formatMacroDisplayValue(v);
                }
                if (v instanceof Date) return v.toISOString();
                if (Array.isArray(v)) return v.map(String).join(", ");
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
      textStyle: { color: CHART.muted, fontSize: legendSize },
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
        color: CHART.muted,
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
