import assert from "node:assert/strict";
import test from "node:test";
import type { MacroPayload } from "@/lib/data/types";
import {
  moveMacroKeyRelative,
  orderMacroKeysByPayload,
  partitionMacroSeries,
} from "./macroPartition";

const payload: MacroPayload = {
  title: "test",
  source: "worldbank",
  categories: ["2024"],
  series: [
    { key: "a", name: "A", data: [1] },
    { key: "b", name: "B", data: [2] },
    { key: "c", name: "C", data: [3] },
  ],
};

test("partitionMacroSeries applies a separate order inside each slot", () => {
  const buckets = partitionMacroSeries(
    payload,
    2,
    { a: 0, b: 0, c: 1 },
    { 0: ["b", "a"] },
  );
  assert.deepEqual(buckets[0]?.map((series) => series.key), ["b", "a"]);
  assert.deepEqual(buckets[1]?.map((series) => series.key), ["c"]);
});

test("unrecorded series stay stable and append after explicitly ordered series", () => {
  const buckets = partitionMacroSeries(payload, 1, { a: 0, b: 0, c: 0 }, { 0: ["b"] });
  assert.deepEqual(buckets[0]?.map((series) => series.key), ["b", "a", "c"]);
});

test("moveMacroKeyRelative supports before and after drops", () => {
  assert.deepEqual(moveMacroKeyRelative(["a", "b", "c"], "c", "a", "before"), [
    "c",
    "a",
    "b",
  ]);
  assert.deepEqual(moveMacroKeyRelative(["a", "b", "c"], "a", "b", "after"), [
    "b",
    "a",
    "c",
  ]);
});

test("settings keys follow the actual payload series order", () => {
  assert.deepEqual(
    orderMacroKeysByPayload(["b", "c", "a", "missing"], payload),
    ["a", "b", "c", "missing"],
  );
  assert.deepEqual(
    orderMacroKeysByPayload(["c", "a"], {
      ...payload,
      series: [payload.series[2]!, payload.series[0]!],
    }),
    ["c", "a"],
  );
});
