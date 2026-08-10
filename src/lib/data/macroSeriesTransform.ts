import type { MacroSeriesCalcOp } from "@/lib/data/macroPresetTemplates";
import { macroAlignPeriodKey, parseMacroDateLabelToUtcMs } from "@/lib/macroPeriodLabel";

function previousYearKey(label: string): string | null {
  const key = macroAlignPeriodKey(label);
  const quarter = /^(\d{4})-Q([1-4])$/i.exec(key);
  if (quarter) return `${Number(quarter[1]) - 1}-Q${quarter[2]}`;
  if (/^\d{4}$/.test(key)) return String(Number(key) - 1);
  const time = parseMacroDateLabelToUtcMs(key);
  if (time == null) return null;
  const date = new Date(time);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

/** Apply a series transform with calendar-aware YoY matching. */
export function applyMacroSeriesOp(
  categories: string[],
  values: (number | null)[],
  op: MacroSeriesCalcOp,
): (number | null)[] {
  if (op === "none") return [...values];
  if (op === "cumsum") {
    let acc = 0;
    return values.map((value) => {
      if (value == null || !Number.isFinite(value)) return null;
      acc += value;
      return acc;
    });
  }
  const byCategory = new Map(categories.map((category, index) => [macroAlignPeriodKey(category), values[index] ?? null]));
  return values.map((value, index) => {
    if (value == null || !Number.isFinite(value)) return null;
    const previous = index > 0 ? values[index - 1] : null;
    if (op === "diff") return previous == null || !Number.isFinite(previous) ? null : value - previous;
    if (op === "pctChange") return previous == null || !Number.isFinite(previous) || previous === 0 ? null : ((value - previous) / Math.abs(previous)) * 100;
    if (op === "yoy") {
      const priorKey = previousYearKey(categories[index]!);
      const prior = priorKey ? byCategory.get(priorKey) ?? null : null;
      return prior == null || !Number.isFinite(prior) || prior === 0 ? null : ((value - prior) / Math.abs(prior)) * 100;
    }
    return value;
  });
}
