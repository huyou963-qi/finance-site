import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CandlestickData } from "lightweight-charts";
import {
  buildTtmEpsTimeline,
  ttmPeLineFromCandles,
} from "./ttmPeSeries";

describe("ttmPeSeries", () => {
  it("buildTtmEpsTimeline sums four quarters", () => {
    const ttm = buildTtmEpsTimeline([
      { date: "2024-03-31", eps: 1 },
      { date: "2024-06-30", eps: 1 },
      { date: "2024-09-30", eps: 1 },
      { date: "2024-12-31", eps: 1 },
    ]);
    assert.equal(ttm.length, 1);
    assert.equal(ttm[0]!.ttmEps, 4);
  });

  it("ttmPeLineFromCandles uses forward-filled TTM EPS", () => {
    const candles: CandlestickData[] = [
      { time: 1_700_000_000 as CandlestickData["time"], open: 100, high: 100, low: 100, close: 40 },
      { time: 1_731_000_000 as CandlestickData["time"], open: 100, high: 100, low: 100, close: 80 },
    ];
    const line = ttmPeLineFromCandles(candles, [
      { date: "2023-06-30", ttmEps: 4 },
      { date: "2024-06-30", ttmEps: 8 },
    ]);
    assert.equal(line.length, 2);
    assert.ok(Math.abs(line[0]!.value - 10) < 1e-6);
    assert.ok(Math.abs(line[1]!.value - 10) < 1e-6);
  });
});
