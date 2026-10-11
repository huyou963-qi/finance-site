import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { MarketDrawing } from "./marketDrawings";
import { drawingGeometry, drawingHandles, drawingProjector, primitiveDistance } from "./drawingGeometry";
export type DrawingHitTarget = MarketDrawing;
export function hitTestDrawing(px: number, py: number, d: MarketDrawing, chart: IChartApi, candle: ISeriesApi<"Candlestick", Time>, width: number, height: number, tol: number): boolean {
 if (d.hidden) return false;
 const project = drawingProjector(chart, candle);
 return drawingHandles(d, project, width).some(p => Math.hypot(px - p.x, py - (d.kind === "vline" ? height / 2 : p.y)) <= tol) || drawingGeometry(d, project, width, height).some(s => primitiveDistance({x: px, y: py}, s) <= tol);
}
export function pickDrawingAt(px: number, py: number, drawings: MarketDrawing[], chart: IChartApi, candle: ISeriesApi<"Candlestick", Time>, width: number, height: number, tolerancePx = 10): string | null {
 for (let i = drawings.length - 1; i >= 0; i--) if (hitTestDrawing(px, py, drawings[i], chart, candle, width, height, tolerancePx)) return drawings[i].id;
 return null;
}
