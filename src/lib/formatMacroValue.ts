/**
 * 宏观「提取数据」表格与导出：按数量级保留合理小数位。
 */
function macroDecimalPlaces(abs: number): number {
  if (abs >= 10_000) return 0;
  if (abs >= 1_000) return 1;
  if (abs >= 10) return 2;
  if (abs >= 1) return 2;
  if (abs >= 0.01) return 3;
  if (abs >= 0.0001) return 4;
  return 6;
}

export function formatMacroDisplayNumber(value: number): string {
  if (!Number.isFinite(value)) return "";

  const decimals = macroDecimalPlaces(Math.abs(value));
  const s = value.toFixed(decimals);
  if (!s.includes(".")) return s;
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** 图表 tooltip / endLabel：接受 ECharts 传入的 unknown */
export function formatMacroDisplayValue(value: unknown): string {
  if (value == null) return "";
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(n)) return typeof value === "string" ? value : "";
  return formatMacroDisplayNumber(n);
}

/** 与展示口径一致的数值（供 CSV/XLSX 单元格） */
export function roundMacroDisplayNumber(value: number): number {
  return Number(formatMacroDisplayNumber(value));
}

function cleanAxisNumber(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Number(value.toPrecision(12));
}

/**
 * “好看”刻度步长（1 / 2 / 5 × 10^n）。
 * round=true 时向最近 nice 值靠拢（用于 step）；false 时向上取（用于 range）。
 */
function niceNumber(range: number, round: boolean): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * 10 ** exponent;
}

/** 自动 Y 轴边界：按展示精度向外取整（legacy；优先用 normalizeMacroAxisExtent） */
export function roundMacroAxisBound(value: number, edge: "min" | "max"): number {
  if (!Number.isFinite(value)) return value;
  const decimals = macroDecimalPlaces(Math.abs(value));
  const factor = 10 ** decimals;
  const rounded =
    edge === "min" ? Math.floor(value * factor) / factor : Math.ceil(value * factor) / factor;
  return roundMacroDisplayNumber(rounded);
}

/**
 * 自动 Y 轴范围：对齐到 1/2/5×10^n 刻度，避免 244.58、8.82 这类边界。
 */
export function normalizeMacroAxisExtent(extent: {
  min: number;
  max: number;
}): { min: number; max: number } {
  let min = extent.min;
  let max = extent.max;
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min, max };
  }

  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.05, 1);
    min -= pad;
    max += pad;
  }

  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }

  const tickCount = 5;
  const step = niceNumber((max - min) / Math.max(tickCount - 1, 1), true);
  let niceMin = Math.floor(min / step) * step;
  let niceMax = Math.ceil(max / step) * step;

  // 数据全非负时不把轴拉到负区间；全非正时同理
  if (min >= 0 && niceMin < 0) niceMin = 0;
  if (max <= 0 && niceMax > 0) niceMax = 0;

  if (niceMin >= niceMax) {
    niceMax = niceMin + step;
  }

  return {
    min: cleanAxisNumber(niceMin),
    max: cleanAxisNumber(niceMax),
  };
}
