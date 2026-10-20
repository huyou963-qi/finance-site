import assert from "node:assert/strict";
import test from "node:test";
import { trailingMean } from "./macroRolling";

test("computes a trailing mean only after a full window", () => {
  assert.deepEqual(trailingMean([1, 2, 3, 4, 5], 4), [null, null, null, 2.5, 3.5]);
});

test("ignores null padding from other series on a unified time axis", () => {
  assert.deepEqual(trailingMean([1, null, 2, null, 3, null, 4, null, 5], 4), [
    null,
    null,
    null,
    null,
    null,
    null,
    2.5,
    null,
    3.5,
  ]);
});

test("treats invalid windows as no rolling transform", () => {
  assert.deepEqual(trailingMean([1, null, 3], 0), [1, null, 3]);
});
