import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateFactLayerGate } from "./sectorHistoricalFactGates";

test("evaluateFactLayerGate requires both endpoints and minimum coverage", () => {
  const gate = evaluateFactLayerGate([
    { date: "2020-01-31", coverage: 0.92, snapshotDate: null, lagDays: null, sampleCount: 40 },
    { date: "2020-12-31", coverage: 0.85, snapshotDate: null, lagDays: null, sampleCount: 38 },
  ], 0.8);
  assert.equal(gate.strict, true);
  assert.equal(gate.coverage, 0.85);
});

test("ETF gate rejects stale snapshots even when weights sum to 100%", () => {
  const gate = evaluateFactLayerGate([
    { date: "2020-01-31", coverage: 1, snapshotDate: "2020-01-30", lagDays: 1, sampleCount: 50 },
    { date: "2020-12-31", coverage: 1, snapshotDate: "2020-12-01", lagDays: 30, sampleCount: 50 },
  ], 0.95, true);
  assert.equal(gate.strict, false);
});
