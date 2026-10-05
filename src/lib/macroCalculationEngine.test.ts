import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMacroSeriesSteps,
  evaluateAdvancedMacroCalculation,
  fillMacroSeries,
  validateMacroFormula,
  type MacroCalculationSeries,
} from "./macroCalculationEngine";
import type { MacroAdvancedDerivedConfig } from "./data/macroPresetTemplates";

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
  assert.match(validateMacroFormula("A + C", ["A", "B"]) ?? "", /未知指标别名 C/);
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
