import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { DrawingPoint } from "./marketDrawings";
import { drawingProjector } from "./drawingGeometry";

export function drawingTimeSeconds(time: Time): number {
  return typeof time === "number" ? time : typeof time === "string" ? Date.parse(time) / 1000 : Date.UTC(time.year, time.month - 1, time.day) / 1000;
}

/** Inverse of the drawing projector, including fractional trading-bar positions.
 * coordinateToTime rounds to a bar and therefore cannot be used for a smooth drag.
 */
export function drawingPointAtPixel(
  chart: IChartApi,
  candle: ISeriesApi<"Candlestick", Time>,
  x: number,
  y: number,
  magnet = false,
  tolerancePx = 8,
): DrawingPoint | null {
  const data = candle.data();
  const timeScale = chart.timeScale();
  const price = candle.coordinateToPrice(y);
  if (!data.length || price === null) return null;
  let lo = 0, hi = data.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const pixel = timeScale.timeToCoordinate(data[mid].time);
    if (pixel === null) return null;
    if (pixel < x) lo = mid + 1; else hi = mid;
  }
  const right = Math.min(data.length - 1, Math.max(1, lo)), left = Math.max(0, right - 1);
  const ax = timeScale.timeToCoordinate(data[left].time), bx = timeScale.timeToCoordinate(data[right].time);
  if (ax === null || bx === null) return null;
  const a = drawingTimeSeconds(data[left].time), b = drawingTimeSeconds(data[right].time);
  const fraction = bx === ax ? 0 : (x - ax) / (bx - ax);
  const point: DrawingPoint = { t: a + (b - a) * fraction, p: price };
  if (!magnet) return point;

  const project = drawingProjector(chart, candle);
  let best = tolerancePx;
  let snapped = point;
  // Compare distance in pixels, not price units (works on linear and log scales).
  for (const i of new Set([left, right])) {
    const bar = data[i];
    if (!bar || !("open" in bar)) continue;
    const time = drawingTimeSeconds(bar.time);
    for (const p of [bar.open, bar.high, bar.low, bar.close]) {
      const pixel = project(time, p);
      if (!pixel) continue;
      const distance = Math.hypot(pixel.x - x, pixel.y - y);
      if (distance <= best) { best = distance; snapped = { t: time, p }; }
    }
  }
  return snapped;
}

/** Keep the initial grab offset so pressing the edge of a handle doesn't jump it. */
export function drawingDragPixel(pointer: { x: number; y: number }, offset: { x: number; y: number }) {
  return { x: pointer.x - offset.x, y: pointer.y - offset.y };
}

export function pauseDrawingNavigation(chart: IChartApi): () => void {
  // Chart applyOptions mutates its existing option objects, including nested scale
  // options. Keep a deep snapshot or "restore" would leave navigation disabled.
  const handleScroll = structuredClone(chart.options().handleScroll);
  const handleScale = structuredClone(chart.options().handleScale);
  chart.applyOptions({ handleScroll: false, handleScale: false });
  return () => chart.applyOptions({ handleScroll, handleScale });
}
