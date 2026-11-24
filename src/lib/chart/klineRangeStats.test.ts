import assert from "node:assert/strict";
import { test } from "node:test";
import type { CandlestickData, IChartApi, Time, UTCTimestamp } from "lightweight-charts";
import { computeKlineRangeStats, computeRangeOverlayPx, computeVisibleRangeExtrema, rangeBarIndexAtPixel } from "./klineRangeStats";
import { computeLayerRangeStats } from "./layerRangeStats";

const candles: CandlestickData[] = [1, 2, 4, 5].map((day) => ({
  time: (Date.UTC(2026, 8, day) / 1000) as UTCTimestamp,
  open: day * 10, high: day * 10 + 2, low: day * 10 - 1, close: day * 10 + 1,
}));

test("visible extrema follow main-asset dates after panning and zooming a shared overlay timeline", () => {
  const day = (d: number) => (Date.UTC(2026, 8, d) / 1000) as UTCTimestamp;
  let range: { from: Time; to: Time } | null = { from: day(1), to: day(4) };
  const chart = {
    timeScale: () => ({
      // Overlay history adds hundreds of earlier logical indices.
      getVisibleLogicalRange: () => ({ from: 500, to: 503 }),
      getVisibleRange: () => range,
    }),
  } as unknown as IChartApi;
  const expected = (high: number, low: number) => ({
    high: { time: day(high), price: high * 10 + 2 },
    low: { time: day(low), price: low * 10 - 1 },
  });
  assert.deepEqual(computeVisibleRangeExtrema(candles, chart), expected(4, 1));
  range = { from: day(2), to: day(5) };
  assert.deepEqual(computeVisibleRangeExtrema(candles, chart), expected(5, 2));
  range = { from: day(2), to: day(2) };
  assert.deepEqual(computeVisibleRangeExtrema(candles, chart), expected(2, 2));
  range = { from: day(3), to: day(3) }; // Only the overlay trades here.
  assert.equal(computeVisibleRangeExtrema(candles, chart), null);
  range = { from: day(6), to: day(8) };
  assert.equal(computeVisibleRangeExtrema(candles, chart), null);
  range = { from: "2026-09-02", to: { year: 2026, month: 9, day: 4 } };
  assert.deepEqual(computeVisibleRangeExtrema(candles, chart), expected(4, 2));
  range = null;
  assert.equal(computeVisibleRangeExtrema(candles, chart), null);
  assert.equal(computeVisibleRangeExtrema([], chart), null);
});

// Overlay history starts earlier and includes a date absent from the main asset.
function fixture(leftWidth = 60, spacing = 20, overlay = true) {
  const positions = overlay ? [100, 120, 160, 180] : [0, 20, 40, 60];
  const chart = {
    priceScale: () => ({ width: () => leftWidth }),
    timeScale: () => ({
      timeToCoordinate: (time: number) => {
        const i = candles.findIndex((c) => c.time === time);
        return i < 0 ? null : positions[i] * spacing / 20;
      },
      options: () => ({ barSpacing: spacing }),
    }),
  } as unknown as IChartApi;
  return { chart, positions: positions.map((x) => leftWidth + x * spacing / 20) };
}

test("selection and edge dragging use actual main-bar positions despite extra overlay dates", () => {
  for (const [axisWidth, spacing] of [[60, 20], [42, 8], [0, 20]]) {
    const { chart, positions } = fixture(axisWidth, spacing);
    for (let i = 0; i < candles.length; i++) {
      for (const rounding of ["floor", "ceil", "nearest"] as const) {
        assert.equal(rangeBarIndexAtPixel(chart, candles, positions[i], rounding), i);
      }
    }
    const gap = (positions[1] + positions[2]) / 2;
    assert.equal(rangeBarIndexAtPixel(chart, candles, gap, "floor"), 1);
    assert.equal(rangeBarIndexAtPixel(chart, candles, gap, "ceil"), 2);
    assert.equal(rangeBarIndexAtPixel(chart, candles, gap - 1), 1);
    assert.equal(rangeBarIndexAtPixel(chart, candles, gap + 1), 2);
    assert.equal(rangeBarIndexAtPixel(chart, candles, -1000), 0);
    assert.equal(rangeBarIndexAtPixel(chart, candles, 10000), 3);

    const i0 = rangeBarIndexAtPixel(chart, candles, positions[1], "floor")!;
    const i1 = rangeBarIndexAtPixel(chart, candles, positions[2], "ceil")!;
    const stats = computeKlineRangeStats(candles, [10, 20, 30, 40], i0, i1, "1d")!;
    assert.equal(stats.count, 2);
    assert.equal(stats.firstOpen, 20);
    assert.equal(stats.lastClose, 41);
    assert.equal(stats.totalVolume, 50);
    const layer = computeLayerRangeStats(candles as { time: number }[], i0, i1, {
      label: "overlay", color: "blue",
      points: [1, 2, 3, 4, 5].map((day) => ({ time: Date.UTC(2026, 8, day) / 1000, value: day })),
    })!;
    assert.equal(layer.count, 2);
    assert.equal(layer.first, 2);
    assert.equal(layer.last, 4);
    assert.deepEqual(computeRangeOverlayPx(chart, candles, i0, i1), {
      left: positions[1] - spacing / 2,
      width: positions[2] - positions[1] + spacing,
    });
  }
});

test("unoverlaid chart keeps selection bounds and empty data produces no selection", () => {
  const { chart, positions } = fixture(0, 20, false);
  assert.equal(rangeBarIndexAtPixel(chart, candles, positions[1] + 2, "floor"), 1);
  assert.equal(rangeBarIndexAtPixel(chart, candles, positions[2] - 2, "ceil"), 2);
  assert.equal(rangeBarIndexAtPixel(chart, [], 20), null);
  assert.equal(computeRangeOverlayPx(chart, [], 0, 1), null);
});
