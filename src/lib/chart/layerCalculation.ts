import type { FundamentalMetric } from "./chartLayers";
import type { MacroFrequencyAdjust, MacroSeriesCalcOp } from "@/lib/data/macroPresetTemplates";
import { applyMacroSeriesOp } from "@/lib/data/macroSeriesTransform";
import { evaluateAdvancedMacroCalculation, inspectMacroFormula, resampleMacroSeries, validateMacroFormula } from "@/lib/macroCalculationEngine";
import { macroPeriodKeyFromDateLabel, parseMacroDateLabelToUtcMs } from "@/lib/macroPeriodLabel";
import { resolveEastmoneyInstrument } from "@/lib/data/eastmoneySymbols";
import { findMarketInstrument } from "@/lib/data/marketInstruments";
import type { TimedValue } from "./alignSeries";

export type PriceField = "close" | "open" | "high" | "low" | "volume";
export type LayerSeriesRef =
  | { kind: "market"; symbol: string; field: PriceField; unit?: string }
  | { kind: "macro"; id: string; label: string; unit?: string; frequency: MacroFrequencyAdjust }
  | { kind: "financial"; symbol: string; metric: FundamentalMetric };
export type LayerInputTransform = Extract<MacroSeriesCalcOp, "none" | "diff" | "pctChange" | "logReturn" | "yoy">;
export type LayerOperation = "formula" | "correlation" | "beta" | "covariance" | "regression";
export type LayerCalculation = {
  operation: LayerOperation;
  inputs: { series: LayerSeriesRef; transform: LayerInputTransform }[];
  frequency: MacroFrequencyAdjust | "auto";
  window: number;
  minPeriods: number;
  formula: string;
  method: "pearson" | "spearman";
};
export type LayerData = {
  points: TimedValue[];
  available?: TimedValue[];
  sampled?: TimedValue[];
  timingEstimated?: boolean;
};

const fields: readonly string[] = ["close", "open", "high", "low", "volume"];
const metrics: readonly string[] = ["ttmPe", "forwardPe", "pb", "eps", "revenue", "grossMargin", "operatingMargin", "netMargin"];
const frequencies: readonly string[] = ["keep", "month", "quarter", "year"];
const operations: readonly string[] = ["formula", "correlation", "beta", "covariance", "regression"];
const inputTransforms: readonly string[] = ["none", "diff", "pctChange", "logReturn", "yoy"];
const symbolPattern = /^[A-Z0-9^][A-Z0-9.^=/-]{0,23}$/;
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const layerInputAlias = (index: number) => String.fromCharCode(65 + index);

export function sanitizeSeriesRef(raw: unknown): LayerSeriesRef | null {
  if (!raw || typeof raw !== "object") return null;
  const ref = raw as Record<string, unknown>;
  const unit = typeof ref.unit === "string" ? ref.unit.trim().slice(0, 60) || undefined : undefined;
  if (ref.kind === "macro" && typeof ref.id === "string" && idPattern.test(ref.id) && typeof ref.label === "string") {
    const frequency = frequencies.includes(String(ref.frequency)) ? ref.frequency as MacroFrequencyAdjust : "keep";
    return { kind: "macro", id: ref.id, label: ref.label.trim().slice(0, 120) || ref.id, unit, frequency };
  }
  const symbol = typeof ref.symbol === "string" ? ref.symbol.trim().toUpperCase() : "";
  if (!symbolPattern.test(symbol)) return null;
  if (ref.kind === "market" && fields.includes(String(ref.field))) {
    return { kind: "market", symbol, field: ref.field as PriceField, unit };
  }
  if (ref.kind === "financial" && metrics.includes(String(ref.metric))) {
    return { kind: "financial", symbol, metric: ref.metric as FundamentalMetric };
  }
  return null;
}

export function sanitizeLayerCalculation(raw: unknown): LayerCalculation | null {
  if (!raw || typeof raw !== "object") return null;
  const calc = raw as Record<string, unknown>;
  if (!operations.includes(String(calc.operation)) || !Array.isArray(calc.inputs)) return null;
  const operation = calc.operation as LayerOperation;
  const maxInputs = operation === "formula" || operation === "regression" ? 8 : 2;
  if (calc.inputs.length < (operation === "formula" ? 1 : 2) || calc.inputs.length > maxInputs) return null;
  const inputs: LayerCalculation["inputs"] = [];
  for (const input of calc.inputs) {
    const series = sanitizeSeriesRef(input?.series);
    if (!series || !inputTransforms.includes(input?.transform)) return null;
    inputs.push({ series, transform: input.transform });
  }
  const frequency = frequencies.includes(String(calc.frequency)) ? calc.frequency as MacroFrequencyAdjust : "auto";
  const window = typeof calc.window === "number" && Number.isInteger(calc.window) ? Math.max(2, Math.min(250, calc.window)) : 60;
  const minPeriods = typeof calc.minPeriods === "number" && Number.isInteger(calc.minPeriods) ? Math.max(2, Math.min(window, calc.minPeriods)) : window;
  const formula = typeof calc.formula === "string" ? calc.formula.trim().slice(0, 400) : "";
  return { operation, inputs, frequency, window, minPeriods, formula, method: calc.method === "spearman" ? "spearman" : "pearson" };
}

export function validateLayerCalculation(calc: LayerCalculation): string | null {
  if (calc.operation === "formula") return validateMacroFormula(calc.formula, calc.inputs.map((_, i) => layerInputAlias(i)));
  if (calc.operation === "regression" && calc.window <= calc.inputs.length) return "回归窗口至少比输入数多一期";
  return null;
}

export function layerSeriesKey(ref: LayerSeriesRef): string {
  if (ref.kind === "macro") return `macro:${ref.id}`;
  if (ref.kind === "market") return `market:${ref.symbol}:${ref.field}`;
  return `financial:${ref.symbol}:${ref.metric}`;
}

export function layerInputFrequency(ref: LayerSeriesRef): MacroFrequencyAdjust {
  if (ref.kind === "macro") return ref.frequency;
  if (ref.kind === "financial" && !["ttmPe", "forwardPe", "pb"].includes(ref.metric)) return "quarter";
  return "keep";
}

export function layerCalculationFrequency(calc: LayerCalculation): MacroFrequencyAdjust {
  if (calc.frequency !== "auto") return calc.frequency;
  const rank: MacroFrequencyAdjust[] = ["keep", "month", "quarter", "year"];
  return rank[Math.max(0, ...calc.inputs.map(input => rank.indexOf(layerInputFrequency(input.series))))]!;
}

export function marketLayerUnit(symbol: string): string | undefined {
  const regional = resolveEastmoneyInstrument(symbol);
  if (regional) return regional.market === "GOLD" ? "USD/盎司" : regional.currency;
  const known = findMarketInstrument(symbol);
  if (known?.fredSeriesId || /^(\^TNX|\^TYX|\^FVX|\^IRX)$/.test(symbol)) return "%";
  // Bare equity and ETF codes are the US listings admitted by the existing symbol directory.
  if (/^[A-Z][A-Z0-9]{0,9}(?:[-.][A-Z])?$/.test(symbol)) return "USD";
  return undefined;
}

export function layerSeriesUnit(ref: LayerSeriesRef): string | undefined {
  if (ref.kind === "market" && ref.field === "volume") {
    const marketUnit = marketLayerUnit(ref.symbol);
    return marketUnit && ["USD", "CNY", "HKD"].includes(marketUnit) ? "股" : undefined;
  }
  if (ref.kind === "market") return marketLayerUnit(ref.symbol);
  if (ref.kind === "macro") return ref.unit;
  if (ref.metric.endsWith("Margin")) return "%";
  if (ref.metric === "eps") return "每股收益";
  return ref.metric === "revenue" ? "营收" : "倍";
}

export function layerCalculationUnit(calc: LayerCalculation): string | undefined {
  if (calc.operation === "correlation") return "相关系数";
  if (calc.operation === "beta") return "Beta";
  if (calc.operation === "regression") return "R²";
  if (calc.operation !== "formula") return undefined;
  const inputs = calc.inputs.map(({ series, transform }, index) => {
    const baseUnit = layerSeriesUnit(series);
    const unit = transform === "none" ? baseUnit : transform === "diff" ? (baseUnit === "%" ? "百分点" : baseUnit) : "%";
    return { alias: layerInputAlias(index), unit };
  });
  if (inputs.some(input => !input.unit)) return undefined;
  const inspection = inspectMacroFormula(calc.formula, inputs);
  if (inspection.warnings.length) return undefined;
  const ratio = /^([A-H])\s*\/\s*([A-H])$/i.exec(calc.formula);
  if (ratio) {
    const aUnit = inputs.find(input => input.alias === ratio[1]!.toUpperCase())?.unit;
    const bUnit = inputs.find(input => input.alias === ratio[2]!.toUpperCase())?.unit;
    if (aUnit && aUnit === bUnit) return "比值";
  }
  return inspection.outputUnit ?? undefined;
}

function periodEndTime(category: string, frequency: MacroFrequencyAdjust): number {
  const start = parseMacroDateLabelToUtcMs(category);
  if (start == null) return NaN;
  if (frequency === "keep") return start / 1000;
  const date = new Date(start);
  const months = frequency === "year" ? 12 : frequency === "quarter" ? 3 : 1;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 0) / 1000;
}

export function evaluateLayerCalculation(calc: LayerCalculation, data: ReadonlyMap<string, LayerData>, asOfSec: number) {
  const validation = validateLayerCalculation(calc);
  if (validation) return { points: [], error: validation, alignedCount: 0, timingEstimated: false, sampleCount: 0, missing: [] };
  const frequency = layerCalculationFrequency(calc);
  const inputs = calc.inputs.map(({ series, transform }, index) => {
    const source = data.get(layerSeriesKey(series));
    const points = (source?.available ?? (frequency !== "keep" ? source?.sampled : undefined) ?? source?.points ?? []).filter(point => point.time <= asOfSec);
    const categories = points.map(point => {
      const time = new Date(point.time * 1000).toISOString();
      return frequency === "keep" && point.time % 86400 !== 0 ? time : time.slice(0, 10);
    });
    const alias = layerInputAlias(index);
    const values = resampleMacroSeries(categories, points.map(point => point.value), frequency,
      series.kind === "market" && series.field === "volume" ? "sum" : "end");
    return { alias, series, transform, source, map: new Map(values.categories.map((key, i) => [key, values.data[i] ?? null])) };
  });
  const timingEstimated = inputs.some(input => input.source?.timingEstimated);
  const union = [...new Set(inputs.flatMap(input => [...input.map.keys()]))].sort((a, b) =>
    (parseMacroDateLabelToUtcMs(a) ?? 0) - (parseMacroDateLabelToUtcMs(b) ?? 0));
  const position = new Map(union.map((key, index) => [key, index]));
  const bounds = inputs.map(input => {
    const keys = [...input.map.keys()];
    return [position.get(keys[0] ?? "") ?? Infinity, position.get(keys.at(-1) ?? "") ?? -Infinity];
  });
  const first = union[Math.max(...bounds.map(bound => bound[0]!))];
  const last = union[Math.min(...bounds.map(bound => bound[1]!))];
  const calendar = frequency === "keep"
    ? union.filter(key => inputs.every(input => input.map.has(key)))
    : first && last ? periodCalendar(first, last, frequency) : [];
  const seriesByKey = new Map(inputs.map(({ alias, map, transform, series }) => [
    alias, { key: alias, name: alias, categories: calendar, unit: layerSeriesUnit(series),
      data: applyMacroSeriesOp(calendar, calendar.map(day => map.get(day) ?? null), transform) },
  ]));
  const result = evaluateAdvancedMacroCalculation({
    version: 2,
    kind: calc.operation === "formula" ? "formula" : calc.operation === "regression" ? "regression" : "correlation",
    inputs: inputs.map(({ alias }) => ({ key: alias, alias, resampleMethod: "end", fillMethod: "none", maxGap: 0 })),
    alignment: { frequency: "keep", join: "union" },
    formula: calc.formula,
    correlation: { metric: calc.operation === "beta" || calc.operation === "covariance" ? calc.operation : "correlation",
      method: calc.method, input: "level", window: calc.window, minPeriods: calc.minPeriods, lag: 0 },
    regression: { input: "level", output: "rSquared", window: calc.window, minPeriods: calc.minPeriods, lag: 0, includeIntercept: true },
  }, seriesByKey);
  const cutoff = frequency === "keep" ? asOfSec : Math.floor(asOfSec / 86400) * 86400 - 1;
  const lastComplete = result.categories.findLastIndex(category => periodEndTime(category, frequency) <= cutoff);
  const recent = lastComplete >= 0 && calc.operation !== "formula"
    ? calendar.slice(Math.max(0, lastComplete - calc.window + 1), lastComplete + 1) : [];
  const prepared = [...seriesByKey.values()];
  const hasPair = (index: number) => prepared.every(series => Number.isFinite(series.data[index]));
  const sampleCount = recent.reduce((count, _, offset) =>
    count + Number(hasPair(lastComplete - recent.length + 1 + offset)), 0);
  const missing: number[] = [];
  const points = result.categories.flatMap((category, index) => {
    const time = periodEndTime(category, frequency);
    const value = result.data[index];
    if (!Number.isFinite(time) || time > cutoff) return [];
    if (value != null && Number.isFinite(value) && (calc.operation === "formula" || hasPair(index))) {
      return [{ time, value: calc.operation === "correlation" ? Math.max(-1, Math.min(1, value)) : value }];
    }
    missing.push(time);
    return [];
  });
  return {
    points,
    error: result.diagnostics.error,
    alignedCount: calendar.filter(category => inputs.every(input => input.map.get(category) != null) &&
      periodEndTime(category, frequency) <= cutoff).length,
    timingEstimated, sampleCount, missing,
  };
}

function periodCalendar(first: string, last: string, frequency: Exclude<MacroFrequencyAdjust, "keep">): string[] {
  const start = new Date(parseMacroDateLabelToUtcMs(first) ?? NaN);
  const end = parseMacroDateLabelToUtcMs(last) ?? NaN;
  const months = frequency === "year" ? 12 : frequency === "quarter" ? 3 : 1;
  const categories: string[] = [];
  for (let time = start.getTime(); time <= end; time = start.setUTCMonth(start.getUTCMonth() + months)) {
    categories.push(macroPeriodKeyFromDateLabel(new Date(time).toISOString().slice(0, 10), frequency));
  }
  return categories;
}
