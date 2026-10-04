import assert from "node:assert/strict";
import test from "node:test";
import { applyMacroDerivedValue } from "./macroDerivedCalc";

test("scales each derived operand before applying the operation", () => {
  assert.equal(
    applyMacroDerivedValue(2.5, 75, "sub", { leftScale: 42 }),
    30,
  );
});

test("keeps the existing result scale behavior", () => {
  assert.equal(applyMacroDerivedValue(25, 100, "ratio", { scale: 100 }), 25);
});

test("returns null for division by zero or non-finite inputs", () => {
  assert.equal(applyMacroDerivedValue(1, 0, "div"), null);
  assert.equal(applyMacroDerivedValue(Number.NaN, 1, "add"), null);
});
