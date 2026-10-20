import assert from "node:assert/strict";
import { test } from "node:test";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { drawingPointAtPixel, drawingDragPixel, pauseDrawingNavigation } from "./drawingPointer";
import { drawingProjector } from "./drawingGeometry";

const data = [
  { time: 1700000000, open: 90, high: 100, low: 80, close: 95 },
  // Deliberately non-uniform trading dates (weekends and holidays).
  { time: 1700259200, open: 95, high: 110, low: 85, close: 100 },
  { time: 1700345600, open: 100, high: 120, low: 90, close: 110 },
];
function fixture(logarithmic = false) {
  const chart = { timeScale: () => ({
    coordinateToLogical: (x: number) => Math.round(x / 20),
    timeToCoordinate: (t: number) => { const i = data.findIndex(d => d.time === t); return i < 0 ? null : i * 20; },
    logicalToCoordinate: (i: number) => Number.isInteger(i) ? i * 20 : 0,
  }) } as unknown as IChartApi;
  const candle = {
    data: () => data,
    coordinateToPrice: (y: number) => logarithmic ? Math.exp((200 - y) / 20) : 200 - y,
    priceToCoordinate: (p: number) => logarithmic ? 200 - Math.log(p) * 20 : 200 - p,
  } as unknown as ISeriesApi<"Candlestick", Time>;
  return { chart, candle };
}
test("drag positions round-trip to the same pixels between bars, across weekends and beyond the last bar", () => {
  const { chart, candle } = fixture();
  const project = drawingProjector(chart, candle);
  for (const x of [-5, 0, 7.25, 15, 25.5, 40, 53]) {
    const point = drawingPointAtPixel(chart, candle, x, 73.5)!;
    const pixel = project(point.t, point.p)!;
    assert.ok(Math.abs(pixel.x - x) < 1e-6);
    assert.equal(pixel.y, 73.5);
  }
});
test("magnet leaves an endpoint under the cursor when far from all OHLC points", () => {
  const { chart, candle } = fixture();
  assert.deepEqual(drawingPointAtPixel(chart, candle, 10, 50, true), { t: 1700129600, p: 150 });
});
test("magnet snaps only within the pixel radius, including horizontal distance", () => {
  const { chart, candle } = fixture();
  assert.deepEqual(drawingPointAtPixel(chart, candle, 3, 99, true), { t: 1700000000, p: 100 });
  assert.equal(drawingPointAtPixel(chart, candle, 10, 100, true)!.p, 100);
  assert.equal(drawingPointAtPixel(chart, candle, 10, 100, true)!.t, 1700129600);
});
test("magnet threshold uses pixels on a logarithmic price scale", () => {
  const { chart, candle } = fixture(true);
  const y = candle.priceToCoordinate(100)!;
  assert.deepEqual(drawingPointAtPixel(chart, candle, 0, y + 1, true), { t: 1700000000, p: 95 });
  const free = drawingPointAtPixel(chart, candle, 0, y - 30, true)!;
  assert.ok(free.p > 100);
});
test("grabbing the edge of an anchor preserves the initial offset", () => {
  const offset = { x: 4, y: -3 };
  assert.deepEqual(drawingDragPixel({ x: 104, y: 97 }, offset), { x: 100, y: 100 });
  assert.deepEqual(drawingDragPixel({ x: 134, y: 77 }, offset), { x: 130, y: 80 });
});
test("release restores navigation even when the chart mutates nested option objects", () => {
  const options = { handleScroll: { pressedMouseMove: true, mouseWheel: false }, handleScale: { mouseWheel: true, axisPressedMouseMove: { time: true, price: false } } };
  const before = structuredClone(options);
  const chart = { options: () => options, applyOptions: (next: typeof options | { handleScroll: false; handleScale: false }) => {
    if (next.handleScroll === false) {
      options.handleScroll.pressedMouseMove = false;
      options.handleScale.mouseWheel = false;
      options.handleScale.axisPressedMouseMove.time = false;
    } else {
      Object.assign(options.handleScroll, next.handleScroll);
      Object.assign(options.handleScale, next.handleScale);
    }
  } } as unknown as IChartApi;
  const restore = pauseDrawingNavigation(chart);
  assert.equal(options.handleScroll.pressedMouseMove, false);
  restore();
  assert.deepEqual(options, before);
});
