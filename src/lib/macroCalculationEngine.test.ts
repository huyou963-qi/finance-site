import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMacroSeriesSteps,
  evaluateAdvancedMacroCalculation,
  fillMacroSeries,
  inspectMacroFormula,
  sortMacroDerivedCalculations,
  validateMacroFormula,
  type MacroCalculationSeries,
} from "./macroCalculationEngine";
import type { MacroAdvancedDerivedConfig, MacroDerivedCalc } from "./data/macroPresetTemplates";

test("single-series steps run in the configured order", () => {
  const result = applyMacroSeriesSteps(
    ["2024-01-01", "2024-01-15", "2024-02-01", "2024-02-15"],
    [100, 110, 121, 133.1],
    [
      { id: "r", type: "resample", frequency: "month", method: "end" },
      { id: "p", type: "transform", op: "pctChange" },
    ],
  );
  assert.deepEqual(result.categories, ["2024-01-01", "2024-02-01"]);
  assert.equal(result.data[0], null);
  assert.ok(Math.abs((result.data[1] ?? 0) - 21) < 1e-9);
});

test("linear fill only fills bounded interior gaps up to maxGap", () => {
  assert.deepEqual(fillMacroSeries([null, 1, null, null, 4, null], "linear", 2), {
    values: [null, 1, 2, 3, 4, null],
    filled: 2,
  });
  assert.deepEqual(fillMacroSeries([1, null, null, 4], "linear", 1).values, [1, null, null, 4]);
});

test("formula parser rejects unknown aliases and evaluates safe functions", () => {
  assert.equal(validateMacroFormula("AVG(A, B) * 2", ["A", "B"]), null);
  assert.equal(validateMacroFormula("IF(A > B, CLAMP(A, 0, 10), IFERROR(B / 0, NA()))", ["A", "B"]), null);
  assert.match(validateMacroFormula("A + C", ["A", "B"]) ?? "", /未知指标别名 C/);
});

test("conditional formulas evaluate comparisons without eval", () => {
  const config: MacroAdvancedDerivedConfig = {
    version: 2,
    kind: "formula",
    inputs: [
      { key: "a", alias: "A", resampleMethod: "end", fillMethod: "none", maxGap: 1 },
      { key: "b", alias: "B", resampleMethod: "end", fillMethod: "none", maxGap: 1 },
    ],
    alignment: { frequency: "keep", join: "inner" },
    formula: "IF(A >= B, CLAMP(A, 0, 10), IFERROR(A / 0, -1))",
  };
  const categories = ["2024-01-01", "2024-02-01", "2024-03-01"];
  const result = evaluateAdvancedMacroCalculation(config, new Map([
    ["a", series("a", categories, [12, 2, 1])],
    ["b", series("b", categories, [4, 2, 3])],
  ]));
  assert.deepEqual(result.data, [10, 2, -1]);
});

function series(key: string, categories: string[], data: (number | null)[]): MacroCalculationSeries {
  return { key, name: key, categories, data };
}

test("advanced formula aligns inputs and reports interpolation", () => {
  const config: MacroAdvancedDerivedConfig = {
    version: 2,
    kind: "formula",
    inputs: [
      { key: "a", alias: "A", resampleMethod: "end", fillMethod: "none", maxGap: 2 },
      { key: "b", alias: "B", resampleMethod: "end", fillMethod: "linear", maxGap: 1 },
    ],
    alignment: { frequency: "keep", join: "left" },
    formula: "(A - B) / B * 100",
  };
  const result = evaluateAdvancedMacroCalculation(
    config,
    new Map([
      ["a", series("a", ["2024-01-01", "2024-02-01", "2024-03-01"], [20, 30, 40])],
      ["b", series("b", ["2024-01-01", "2024-02-01", "2024-03-01"], [10, null, 30])],
    ]),
  );
  assert.equal(result.diagnostics.filledPoints.B, 1);
  assert.equal(result.diagnostics.validPoints, 3);
  assert.deepEqual(result.data.map((value) => value == null ? null : Math.round(value)), [100, 50, 33]);
  assert.ok(result.diagnostics.warnings.some((warning) => warning.includes("前视")));
});

test("rolling Pearson correlation returns a time series", () => {
  const config: MacroAdvancedDerivedConfig = {
    version: 2,
    kind: "correlation",
    inputs: [
      { key: "a", alias: "A", resampleMethod: "end", fillMethod: "none", maxGap: 1 },
      { key: "b", alias: "B", resampleMethod: "end", fillMethod: "none", maxGap: 1 },
    ],
    alignment: { frequency: "keep", join: "inner" },
    correlation: { method: "pearson", input: "level", window: 3, minPeriods: 3, lag: 0 },
  };
  const categories = ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"];
  const result = evaluateAdvancedMacroCalculation(
    config,
    new Map([
      ["a", series("a", categories, [1, 2, 3, 4])],
      ["b", series("b", categories, [2, 4, 6, 8])],
    ]),
  );
  assert.deepEqual(result.data.slice(0, 2), [null, null]);
  assert.ok(Math.abs((result.data[2] ?? 0) - 1) < 1e-12);
  assert.ok(Math.abs((result.data[3] ?? 0) - 1) < 1e-12);
});

test("rolling z-score uses the configured sample convention", () => {
  const result = applyMacroSeriesSteps(
    ["2024-01-01", "2024-02-01", "2024-03-01"],
    [1, 2, 3],
    [{ id: "z", type: "zScore", window: 3, minPeriods: 3, sample: false }],
  );
  assert.deepEqual(result.data.slice(0, 2), [null, null]);
  assert.ok(Math.abs((result.data[2] ?? 0) - Math.sqrt(1.5)) < 1e-12);
});

test("rolling quantile and outlier steps can be composed", () => {
  const winsorized = applyMacroSeriesSteps(
    ["1", "2", "3", "4", "5"],
    [1, 2, 3, 4, 100],
    [{ id: "w", type: "outlier", method: "winsorize", lower: 0.2, upper: 0.8 }],
  );
  assert.ok((winsorized.data[4] ?? 0) < 100);
  const median = applyMacroSeriesSteps(
    ["1", "2", "3", "4"],
    [1, 100, 3, 4],
    [{ id: "q", type: "rollingQuantile", window: 3, minPeriods: 3, quantile: 0.5 }],
  );
  assert.deepEqual(median.data, [null, null, 3, 4]);
});

test("rolling covariance and beta share aligned paired samples", () => {
  const categories = ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"];
  const inputs = [
    { key: "a", alias: "A", resampleMethod: "end" as const, fillMethod: "none" as const, maxGap: 1 },
    { key: "b", alias: "B", resampleMethod: "end" as const, fillMethod: "none" as const, maxGap: 1 },
  ];
  const source = new Map([
    ["a", { ...series("a", categories, [2, 4, 6, 8]), unit: "%" }],
    ["b", { ...series("b", categories, [1, 2, 3, 4]), unit: "%" }],
  ]);
  const base = {
    version: 2 as const,
    kind: "correlation" as const,
    inputs,
    alignment: { frequency: "keep" as const, join: "inner" as const },
  };
  const covarianceResult = evaluateAdvancedMacroCalculation(
    { ...base, correlation: { metric: "covariance", method: "pearson", input: "level", window: 4, minPeriods: 4, lag: 0, sample: true } },
    source,
  );
  assert.ok(Math.abs((covarianceResult.data[3] ?? 0) - 10 / 3) < 1e-12);
  const betaResult = evaluateAdvancedMacroCalculation(
    { ...base, correlation: { metric: "beta", method: "pearson", input: "level", window: 4, minPeriods: 4, lag: 0, sample: true } },
    source,
  );
  assert.ok(Math.abs((betaResult.data[3] ?? 0) - 2) < 1e-12);
});

test("rolling multiple regression returns coefficient, fitted values, and residuals", () => {
  const categories = Array.from({ length: 8 }, (_, index) => `2024-${String(index + 1).padStart(2, "0")}-01`);
  const b = categories.map((_, index) => index + 1);
  const c = categories.map((_, index) => (index % 3) - 1);
  const a = b.map((value, index) => 1 + 2 * value + 3 * c[index]!);
  const inputs = [
    { key: "a", alias: "A", resampleMethod: "end" as const, fillMethod: "none" as const, maxGap: 1 },
    { key: "b", alias: "B", resampleMethod: "end" as const, fillMethod: "none" as const, maxGap: 1 },
    { key: "c", alias: "C", resampleMethod: "end" as const, fillMethod: "none" as const, maxGap: 1 },
  ];
  const source = new Map([
    ["a", series("a", categories, a)],
    ["b", series("b", categories, b)],
    ["c", series("c", categories, c)],
  ]);
  const base = {
    version: 2 as const,
    kind: "regression" as const,
    inputs,
    alignment: { frequency: "keep" as const, join: "inner" as const },
  };
  const coefficient = evaluateAdvancedMacroCalculation({
    ...base,
    regression: { output: "coefficient", input: "level", window: 8, minPeriods: 6, lag: 0, includeIntercept: true },
  }, source);
  assert.ok(Math.abs((coefficient.data[7] ?? 0) - 2) < 1e-10);
  const residual = evaluateAdvancedMacroCalculation({
    ...base,
    regression: { output: "residual", input: "level", window: 8, minPeriods: 6, lag: 0, includeIntercept: true },
  }, source);
  assert.ok(Math.abs(residual.data[7] ?? 1) < 1e-10);
  const fitted = evaluateAdvancedMacroCalculation({
    ...base,
    regression: { output: "fitted", input: "level", window: 8, minPeriods: 6, lag: 0, includeIntercept: true },
  }, source);
  assert.ok(Math.abs((fitted.data[7] ?? 0) - a[7]!) < 1e-10);
});

test("formula inspection infers compatible units and warns on incompatible addition", () => {
  const ratio = inspectMacroFormula("A / B * 100", [
    { alias: "A", unit: "USD" },
    { alias: "B", unit: "USD" },
  ]);
  assert.equal(ratio.outputUnit, "无量纲");
  assert.deepEqual(ratio.warnings, []);
  const invalid = inspectMacroFormula("A + B", [
    { alias: "A", unit: "USD" },
    { alias: "B", unit: "%" },
  ]);
  assert.ok(invalid.warnings.some((warning) => warning.includes("单位不一致")));
});

test("derived calculations are topologically ordered and cycles are reported", () => {
  const base = { id: "base", leftKey: "a", rightKey: "b", op: "add" as const, name: "base" };
  const dependent = { id: "dependent", leftKey: "calc:base", rightKey: "c", op: "sub" as const, name: "dependent" };
  const sorted = sortMacroDerivedCalculations([dependent, base]);
  assert.deepEqual(sorted.ordered.map((calc) => calc.id), ["base", "dependent"]);
  assert.deepEqual(sorted.cyclicIds, []);
  const cyclic = sortMacroDerivedCalculations([
    { ...base, leftKey: "calc:dependent" },
    dependent,
  ]);
  assert.deepEqual(new Set(cyclic.cyclicIds), new Set(["base", "dependent"]));
  assert.deepEqual(cyclic.ordered, []);
});

test("single-series derived calculations participate in dependency ordering", () => {
  const base: MacroDerivedCalc = {
    id: "base",
    leftKey: "a",
    rightKey: "b",
    op: "add",
    name: "base",
  };
  const single: MacroDerivedCalc = {
    id: "single",
    leftKey: "calc:base",
    rightKey: "calc:base",
    op: "add",
    name: "base rolling mean",
    single: {
      inputKey: "calc:base",
      steps: [{ id: "mean", type: "rollingMean", window: 3, minPeriods: 2 }],
    },
  };
  const sorted = sortMacroDerivedCalculations([single, base]);
  assert.deepEqual(sorted.ordered.map((calc) => calc.id), ["base", "single"]);
  assert.deepEqual(sorted.cyclicIds, []);
});
