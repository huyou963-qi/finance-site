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

/** 自动 Y 轴边界：按展示精度向外取整，避免 8.903585 这类刻度 */
export function roundMacroAxisBound(value: number, edge: "min" | "max"): number {
  if (!Number.isFinite(value)) return value;
  const decimals = macroDecimalPlaces(Math.abs(value));
  const factor = 10 ** decimals;
  const rounded =
    edge === "min" ? Math.floor(value * factor) / factor : Math.ceil(value * factor) / factor;
  return roundMacroDisplayNumber(rounded);
}

export function normalizeMacroAxisExtent(extent: {
  min: number;
  max: number;
}): { min: number; max: number } {
  let min = roundMacroAxisBound(extent.min, "min");
  let max = roundMacroAxisBound(extent.max, "max");
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    max = min + Math.max(Math.abs(min) * 0.02, 0.01);
    max = roundMacroAxisBound(max, "max");
  }
  return { min, max };
}
