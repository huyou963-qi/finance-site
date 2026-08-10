import assert from "node:assert/strict";
import test from "node:test";
import { applyMacroSeriesOp } from "./macroSeriesTransform";

test("quarterly YoY matches the same quarter in the prior year", () => {
  const categories = ["2024-Q1", "2024-Q2", "2024-Q4", "2025-Q1", "2025-Q2", "2025-Q4"];
  assert.deepEqual(applyMacroSeriesOp(categories, [100, 110, 120, 105, 121, 108], "yoy"), [null, null, null, 5, 10, -10]);
});

test("monthly YoY does not bridge a missing same-month observation", () => {
  const categories = ["2024-01-01", "2024-03-01", "2025-01-01", "2025-02-01", "2025-03-01"];
  assert.deepEqual(applyMacroSeriesOp(categories, [100, 120, 110, 115, 132], "yoy"), [null, null, 10, null, 10]);
});
