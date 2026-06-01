import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CandlestickData } from "lightweight-charts";
import {
  adjustOhlcBySplitActions,
  adjustOhlcFromAdjRatios,
  applyBackwardAdjustment,
  applyKlinePriceAdjustment,
  detectSplitLikeActions,
} from "./klineAdjustment";
import { cumulativeUsSplitFactor } from "./klineUsSplitCalendar";

function bar(t: number, close: number): CandlestickData {
  return { time: t as CandlestickData["time"], open: close, high: close, low: close, close };
}

describe("klineAdjustment", () => {
  it("detects 4-for-1 split drop", () => {
    const candles = [
      bar(1, 200),
      bar(2, 208),
      bar(3, 52),
      bar(4, 51),
    ];
    const acts = detectSplitLikeActions(candles);
    assert.equal(acts.length, 1);
    assert.equal(acts[0]!.barIndex, 2);
    assert.ok(acts[0]!.ratio > 3.5);
    assert.ok(acts[0]!.ratio < 4.5);
  });

  it("forward split scales bars before ex-date only", () => {
    const candles = [
      bar(1, 200),
      bar(2, 208),
      bar(3, 52),
      bar(4, 51),
    ];
    const out = adjustOhlcBySplitActions(candles, "forward");
    assert.ok(Math.abs(out[0]!.close - 50) < 1);
    assert.ok(Math.abs(out[1]!.close - 52) < 1);
    assert.ok(Math.abs(out[2]!.close - 52) < 1);
    assert.ok(Math.abs(out[3]!.close - 51) < 1);
  });

  it("forward does not scale pre-ex-date bars already at post-split scale (IB 6/16)", () => {
    const candles: CandlestickData[] = [
      { time: 1 as CandlestickData["time"], open: 51.1, high: 52.75, low: 51, close: 52.38 },
      { time: 2 as CandlestickData["time"], open: 209.5, high: 210.88, low: 206, close: 209.2 },
      { time: 3 as CandlestickData["time"], open: 206.2, high: 206.2, low: 51.6, close: 52.65 },
      { time: 4 as CandlestickData["time"], open: 52.65, high: 53.3, low: 51.17, close: 51.52 },
    ];
    const out = adjustOhlcBySplitActions(candles, "forward");
    assert.ok(Math.abs(out[0]!.close - 52.38) < 0.5, `6/16 close=${out[0]!.close}`);
    assert.ok(Math.abs(out[1]!.close - 52.3) < 1.5, `6/17 close=${out[1]!.close}`);
    assert.ok(Math.abs(out[2]!.close - 52.65) < 1);
    assert.ok(out[2]!.high < 80);
  });

  it("none returns raw OHLC without adjustment", () => {
    const candles: CandlestickData[] = [
      { time: 1 as CandlestickData["time"], open: 51, high: 210, low: 49, close: 52 },
    ];
    const out = adjustOhlcBySplitActions(candles, "none");
    assert.equal(out[0]!.high, 210);
    assert.equal(out[0]!.low, 49);
    assert.notEqual(out, candles);
  });

  it("IBKR none restores nominal pre-split prices from Trades-adjusted history", () => {
    const candles: CandlestickData[] = [
      { time: 1 as CandlestickData["time"], open: 41, high: 43, low: 39, close: 42 },
      { time: 2 as CandlestickData["time"], open: 39, high: 41, low: 38, close: 40 },
      { time: 3 as CandlestickData["time"], open: 51.1, high: 52.75, low: 51, close: 52.38 },
      { time: 4 as CandlestickData["time"], open: 209.5, high: 210.88, low: 206, close: 209.2 },
      { time: 5 as CandlestickData["time"], open: 206.2, high: 206.2, low: 51.6, close: 52.65 },
      { time: 6 as CandlestickData["time"], open: 52.65, high: 53.3, low: 51.17, close: 51.52 },
    ];
    const out = applyKlinePriceAdjustment(candles, "none", { klineSource: "ibkr" });
    assert.ok(out[0]!.close > 160, `history close=${out[0]!.close}`);
    assert.ok(out[1]!.close > 155, `history2 close=${out[1]!.close}`);
    assert.ok(Math.abs(out[2]!.close - 209) < 3);
    assert.ok(Math.abs(out[3]!.close - 209.2) < 1);
    assert.ok(out[4]!.high < 80, `ex-date high=${out[4]!.high}`);
    assert.ok(Math.abs(out[4]!.close - 52.65) < 1);
    assert.ok(Math.abs(out[5]!.close - 51.52) < 1);
  });

  it("forward adj ratios apply event factor on the bar after the jump", () => {
    const candles = [bar(1, 200), bar(2, 50)];
    const adjClose = [50, 50];
    const rawClose = [200, 50];
    const out = adjustOhlcFromAdjRatios(candles, adjClose, rawClose, "forward");
    assert.ok(Math.abs(out[0]!.close - 50) < 1e-4);
    assert.ok(Math.abs(out[1]!.close - 50) < 1e-4);
  });

  it("forward fixes mixed OHLC on ex-date bar (close post-split, high pre-split)", () => {
    const candles: CandlestickData[] = [
      { time: 1 as CandlestickData["time"], open: 200, high: 210, low: 198, close: 208 },
      {
        time: 2 as CandlestickData["time"],
        open: 205,
        high: 212,
        low: 50,
        close: 52,
      },
      { time: 3 as CandlestickData["time"], open: 51, high: 53, low: 49, close: 51 },
    ];
    const out = adjustOhlcBySplitActions(candles, "forward");
    assert.ok(Math.abs(out[0]!.close - 52) < 1);
    assert.ok(out[1]!.high < 80, `ex-date high=${out[1]!.high}`);
    assert.ok(out[1]!.open < 80, `ex-date open=${out[1]!.open}`);
    assert.ok(Math.abs(out[1]!.close - 52) < 1);
    assert.ok(Math.abs(out[2]!.close - 51) < 1);
  });

  it("backward fixes mixed OHLC on ex-date (no double-scale spike on high)", () => {
    const candles: CandlestickData[] = [
      { time: 1 as CandlestickData["time"], open: 200, high: 210, low: 198, close: 208 },
      {
        time: 2 as CandlestickData["time"],
        open: 205,
        high: 212,
        low: 50,
        close: 52,
      },
      { time: 3 as CandlestickData["time"], open: 51, high: 53, low: 49, close: 51 },
    ];
    const out = adjustOhlcBySplitActions(candles, "backward");
    assert.ok(Math.abs(out[0]!.close - 208) < 1);
    assert.ok(out[1]!.high < 220, `ex-date high=${out[1]!.high}`);
    assert.ok(out[1]!.high > 180);
    assert.ok(out[1]!.low > 180, `ex-date low=${out[1]!.low}`);
    assert.ok(Math.abs(out[1]!.close - 208) < 4);
    assert.ok(Math.abs(out[2]!.close - 204) < 4);
  });

  it("backward fixes IBKR split window (6/16 post-split, 6/17 pre, 6/18 mixed)", () => {
    const candles: CandlestickData[] = [
      {
        time: 566 as CandlestickData["time"],
        open: 51.1,
        high: 52.75,
        low: 51,
        close: 52.38,
      },
      {
        time: 567 as CandlestickData["time"],
        open: 209.5,
        high: 210.88,
        low: 206,
        close: 209.2,
      },
      {
        time: 568 as CandlestickData["time"],
        open: 206.2,
        high: 206.2,
        low: 51.6,
        close: 52.65,
      },
      {
        time: 569 as CandlestickData["time"],
        open: 52.65,
        high: 53.3,
        low: 51.17,
        close: 51.52,
      },
    ];
    const acts = detectSplitLikeActions(candles);
    assert.equal(acts.length, 1);
    assert.equal(acts[0]!.barIndex, 2);
    const out = adjustOhlcBySplitActions(candles, "backward");
    assert.ok(Math.abs(out[0]!.close - 208) < 3, `6/16 close=${out[0]!.close}`);
    assert.ok(Math.abs(out[1]!.close - 209.2) < 1);
    assert.ok(out[1]!.high / out[1]!.low < 1.05);
    assert.ok(out[2]!.high / out[2]!.low < 1.05, `6/18 ratio=${out[2]!.high / out[2]!.low}`);
    assert.ok(Math.abs(out[3]!.close - 204) < 4, `6/20 close=${out[3]!.close}`);
  });

  it("backward fixes pre-ex-date bar with leaked post-split low (6/17-like)", () => {
    const candles: CandlestickData[] = [
      { time: 1 as CandlestickData["time"], open: 200, high: 205, low: 198, close: 202 },
      {
        time: 2 as CandlestickData["time"],
        open: 208,
        high: 211,
        low: 49,
        close: 207,
      },
      {
        time: 3 as CandlestickData["time"],
        open: 205,
        high: 212,
        low: 50,
        close: 52,
      },
      { time: 4 as CandlestickData["time"], open: 51, high: 53, low: 49, close: 51 },
    ];
    const out = adjustOhlcBySplitActions(candles, "backward");
    assert.ok(Math.abs(out[0]!.close - 202) < 1);
    assert.ok(out[1]!.low > 180, `6/17 low=${out[1]!.low}`);
    assert.ok(out[1]!.high > 180);
    assert.ok(out[1]!.high / out[1]!.low < 1.08);
    assert.ok(out[2]!.low > 180);
    assert.ok(Math.abs(out[3]!.close - 204) < 4);
  });

  it("AAPL cumulative split factor is 224", () => {
    assert.equal(cumulativeUsSplitFactor("AAPL"), 224);
  });

  it("IBKR backward scales entire forward-adjusted series by cumulative splits (AAPL ~7万)", () => {
    const candles = [bar(1, 305)];
    const out = applyKlinePriceAdjustment(candles, "backward", {
      symbol: "AAPL",
      klineSource: "ibkr",
    });
    assert.ok(Math.abs(out[0]!.close - 305 * 224) < 1, `close=${out[0]!.close}`);
  });

  it("applyBackwardAdjustment uses calendar when ibkrForwardAdjusted", () => {
    const out = applyBackwardAdjustment([bar(1, 100)], undefined, {
      symbol: "AAPL",
      ibkrForwardAdjusted: true,
    });
    assert.equal(out[0]!.close, 100 * 224);
  });
});
