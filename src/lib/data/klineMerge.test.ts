import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CandlestickData } from "lightweight-charts";
import {
  alignFuturesOlderSegmentAtBoundary,
  mergeCandlesOlderFirst,
} from "./klineMerge";

function bar(t: number, close: number): CandlestickData {
  return { time: t as CandlestickData["time"], open: close, high: close, low: close, close };
}

describe("klineMerge cont fut", () => {
  it("overlap prefers older FUT over newer CONTFUT on same dates", () => {
    const older = [bar(10, 2706), bar(11, 2708)];
    const newer = [bar(11, 2950), bar(12, 2960)];
    const out = mergeCandlesOlderFirst(older, newer, "older");
    assert.equal(out.length, 3);
    assert.equal(out[1]!.close, 2708);
  });

  it("alignFuturesOlderSegmentAtBoundary scales older segment", () => {
    const older = [bar(10, 2700), bar(11, 2706)];
    const newer = [bar(12, 2950)];
    const aligned = alignFuturesOlderSegmentAtBoundary(older, newer);
    assert.ok(Math.abs(aligned[1]!.close - 2950) < 2);
  });
});
