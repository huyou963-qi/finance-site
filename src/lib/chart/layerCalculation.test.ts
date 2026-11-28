import assert from "node:assert/strict";
import test from "node:test";
import { createChartLayer, sanitizeChartLayersPrefs, type ChartLayer } from "./chartLayers";
import { deriveLayerSeries } from "./deriveLayerSeries";
import { evaluateLayerCalculation, layerCalculationFrequency, layerSeriesKey, type LayerCalculation, type LayerData, type LayerSeriesRef } from "./layerCalculation";

const spy = { kind: "market", symbol: "SPY", field: "close" } as const;
const qqq = { kind: "market", symbol: "QQQ", field: "close" } as const;
const cpi = { kind: "macro", id: "f50a4383-18ff-459f-bb26-3039537fd226", label: "CPI", unit: "Index", frequency: "month" } as const;
const day = (label: string) => Date.parse(label) / 1000;

const points = (pairs: [string, number][]) => pairs.map(([date, value]) => ({ time: day(date), value }));
const correlation: LayerCalculation = {
  operation: "correlation",
  inputs: [
    { series: spy, transform: "diff" },
    { series: qqq, transform: "diff" },
  ],
  window: 3, minPeriods: 3, frequency: "auto", formula: "", method: "pearson",
};

test("calculates Pearson correlation after independent transforms and reports the paired window", () => {
  const data = new Map<string, LayerData>([
    [layerSeriesKey(spy), { points: points([["2025-01-02", 50], ["2025-01-03", 51], ["2025-01-06", 54], ["2025-01-07", 63]]) }],
    [layerSeriesKey(qqq), { points: points([["2025-01-02", 30], ["2025-01-03", 28], ["2025-01-06", 22], ["2025-01-07", 4]]) }],
  ]);
  const result = evaluateLayerCalculation(correlation, data, day("2025-01-07"));
  assert.equal(result.sampleCount, 3);
  assert.equal(result.alignedCount, 4);
  assert.deepEqual(result.points, [{ time: day("2025-01-07"), value: -1 }]);
});

test("pairs mixed frequencies in release months, retains missing months, and emits only completed periods", () => {
  const calc: LayerCalculation = {
    ...correlation,
    operation: "formula",
    formula: "B",
    inputs: [{ series: spy, transform: "none" }, { series: cpi, transform: "none" }],
  };
  const data = new Map<string, LayerData>([
    [layerSeriesKey(spy), { points: points([["2025-01-31", 501], ["2025-02-28", 502], ["2025-03-31", 503], ["2025-04-30", 504]]) }],
    [layerSeriesKey(cpi), {
      points: points([["2025-01-01", 199], ["2025-03-01", 299]]),
      available: points([["2025-02-14", 201], ["2025-04-15", 301], ["2025-05-15", 400]]),
    }],
  ]);
  assert.equal(layerCalculationFrequency(calc), "month");
  const result = evaluateLayerCalculation(calc, data, day("2025-05-01"));
  assert.deepEqual(result.points, points([["2025-02-28", 201], ["2025-04-30", 301]]));
  assert.ok(result.missing.includes(day("2025-03-31")));
  assert.deepEqual(evaluateLayerCalculation(calc, data, day("2025-04-30")).points, points([["2025-02-28", 201]]));
});

test("multivariable formula joins source references across price, macro and filing-date data", () => {
  const eps: LayerSeriesRef = { kind: "financial", symbol: "AAPL", metric: "eps" };
  const calc: LayerCalculation = {
    ...correlation,
    operation: "formula",
    formula: "A - 2 * B + ABS(C)",
    inputs: [spy, cpi, eps].map(series => ({ series, transform: "none" })),
  };
  const data = new Map<string, LayerData>([
    [layerSeriesKey(spy), { points: points([["2025-03-31", 500], ["2025-06-30", 550]]) }],
    [layerSeriesKey(cpi), { points: [], available: points([["2025-03-01", 100], ["2025-06-01", 110]]) }],
    [layerSeriesKey(eps), { points: points([["2025-03-31", 9]]), available: points([["2025-05-09", 5]]) }],
  ]);
  assert.equal(layerCalculationFrequency(calc), "quarter");
  assert.deepEqual(evaluateLayerCalculation(calc, data, day("2025-07-01")).points, points([["2025-06-30", 335]]));
});

test("keeps legacy storage while routing conflicting units to an independent pane", () => {
  const layers: ChartLayer[] = [
    createChartLayer({ kind: "price", symbol: "QQQ", field: "close" }, [], { axis: { mode: "right" } }),
    createChartLayer({ kind: "series", series: qqq }, [], { axis: { mode: "right" } }),
    createChartLayer({ kind: "calculation", calculation: correlation }, [], { axis: { mode: "right" } }),
    createChartLayer({ kind: "series", series: cpi }, [], { axis: { mode: "left" } }),
    createChartLayer({ kind: "series", series: spy }, [], { axis: { mode: "left" } }),
  ];
  const restored = sanitizeChartLayersPrefs(JSON.parse(JSON.stringify({ layers, compareMode: false })));
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify({ layers, compareMode: false })));
  const derived = deriveLayerSeries(restored, { primaryCloses: [], priceBySymbol: {}, fundamentalsBySymbol: {}, primaryUnit: "USD", primarySymbol: "SPY" });
  assert.deepEqual(derived.map(layer => layer.axis.mode), ["right", "right", "subpane", "left", "subpane"]);
  assert.deepEqual(derived[2]?.fixedRange, { minValue: -1, maxValue: 1 });
});
