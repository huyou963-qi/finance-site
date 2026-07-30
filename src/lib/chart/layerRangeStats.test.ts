import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeAllLayerRangeStats,
  computeLayerRangeStats,
} from "./layerRangeStats";

describe("layerRangeStats", () => {
  const bars = [
    { time: 100 },
    { time: 200 },
    { time: 300 },
    { time: 400 },
  ];

  it("stats overlay line over bar index range", () => {
    const s = computeLayerRangeStats(bars, 1, 3, {
      label: "MSFT",
      color: "#38bdf8",
      points: [
        { time: 100, value: 50 },
        { time: 200, value: 60 },
        { time: 300, value: 55 },
        { time: 400, value: 70 },
      ],
    });
    assert.ok(s);
    assert.equal(s!.count, 3);
    assert.equal(s!.first, 60);
    assert.equal(s!.last, 70);
    assert.equal(s!.max, 70);
    assert.equal(s!.min, 55);
    assert.ok(Math.abs(s!.changePct - ((70 - 60) / 60) * 100) < 1e-9);
  });

  it("skips missing join days for expression-like sparse series", () => {
    const s = computeLayerRangeStats(bars, 0, 3, {
      label: "AAPL/SPY",
      color: "#f472b6",
      points: [
        { time: 100, value: 1 },
        { time: 300, value: 1.2 },
      ],
    });
    assert.ok(s);
    assert.equal(s!.count, 2);
    assert.equal(s!.first, 1);
    assert.equal(s!.last, 1.2);
  });

  it("batch skips empty layers", () => {
    const all = computeAllLayerRangeStats(bars, 0, 2, [
      { label: "empty", color: "#fff", points: [] },
      {
        label: "ok",
        color: "#0f0",
        points: [
          { time: 100, value: 2 },
          { time: 200, value: 4 },
        ],
      },
    ]);
    assert.equal(all.length, 1);
    assert.equal(all[0]!.label, "ok");
    assert.equal(all[0]!.changePct, 100);
  });
});
