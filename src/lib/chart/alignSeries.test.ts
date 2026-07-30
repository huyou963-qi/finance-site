import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyIndex100,
  applyPctChange,
  innerJoinSeries,
  stepFillToDaily,
} from "./alignSeries";

describe("alignSeries", () => {
  it("inner joins on common times", () => {
    const a = [
      { time: 1, value: 10 },
      { time: 2, value: 20 },
      { time: 3, value: 30 },
    ];
    const b = [
      { time: 2, value: 5 },
      { time: 3, value: 6 },
      { time: 4, value: 7 },
    ];
    const j = innerJoinSeries([a, b]);
    assert.deepEqual(j, [
      { time: 2, values: [20, 5] },
      { time: 3, values: [30, 6] },
    ]);
  });

  it("index100 uses first point as 100", () => {
    const pts = applyIndex100([
      { time: 1, value: 50 },
      { time: 2, value: 75 },
    ]);
    assert.equal(pts[0]!.value, 100);
    assert.equal(pts[1]!.value, 150);
  });

  it("pctChange from first point", () => {
    const pts = applyPctChange([
      { time: 1, value: 100 },
      { time: 2, value: 110 },
    ]);
    assert.equal(pts[0]!.value, 0);
    assert.equal(pts[1]!.value, 10);
  });

  it("step-fills quarterly to daily with lag", () => {
    // fiscalDate 2024-03-31 + 40d ≈ 2024-05-10
    const daily = [
      Math.floor(Date.parse("2024-05-01T00:00:00Z") / 1000),
      Math.floor(Date.parse("2024-05-15T00:00:00Z") / 1000),
      Math.floor(Date.parse("2024-08-20T00:00:00Z") / 1000),
    ];
    const out = stepFillToDaily(
      [
        { fiscalDate: "2024-03-31", value: 1.2 },
        { fiscalDate: "2024-06-30", value: 1.5 },
      ],
      daily,
      40,
    );
    assert.equal(out.length, 2);
    assert.equal(out[0]!.value, 1.2);
    assert.equal(out[1]!.value, 1.5);
  });
});
