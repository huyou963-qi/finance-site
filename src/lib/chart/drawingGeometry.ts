import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { FIB_LEVELS, drawingPoints, type MarketDrawing } from "./marketDrawings";
export type Pixel = { x: number; y: number };
export type Primitive = { kind: "line"; a: Pixel; b: Pixel; label?: string; color?: string } | { kind: "rect" | "ellipse"; a: Pixel; b: Pixel; color?: string } | { kind: "text"; a: Pixel; label: string; color?: string };
/** Exact intersection of an infinite line (or forward ray) with the plot. */
export function clipDrawingLine(a: Pixel, b: Pixel, width: number, height: number, both = true): { a: Pixel; b: Pixel } | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9 || width <= 0 || height <= 0) return null;
  let from = both ? -Infinity : 0, to = Infinity;
  for (const [position, direction, limit] of [[a.x, dx, width], [a.y, dy, height]]) {
    if (Math.abs(direction) < 1e-9) { if (position < 0 || position > limit) return null; continue; }
    const first = -position / direction, last = (limit - position) / direction;
    from = Math.max(from, Math.min(first, last));
    to = Math.min(to, Math.max(first, last));
    if (from > to) return null;
  }
  return { a: { x: a.x + from * dx, y: a.y + from * dy }, b: { x: a.x + to * dx, y: a.y + to * dy } };
}
export function drawingProjector(chart: IChartApi, candle: ISeriesApi<"Candlestick", Time>) {
  const ts = chart.timeScale();
  const data = candle.data();
  return (t: number, p: number): Pixel | null => {
    if (!data.length) return null;
    const seconds = (time: Time) => typeof time === "number" ? time : typeof time === "string" ? Date.parse(time) / 1000 : Date.UTC(time.year, time.month - 1, time.day) / 1000;
    let lo = 0, hi = data.length - 1;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (seconds(data[mid].time) < t) lo = mid + 1; else hi = mid; }
    const right = Math.min(data.length - 1, Math.max(1, lo)), left = Math.max(0, right - 1);
    const ax = ts.timeToCoordinate(data[left].time), bx = ts.timeToCoordinate(data[right].time);
    if (ax === null || bx === null) return null;
    const ta = seconds(data[left].time), tb = seconds(data[right].time);
    // The installed chart version rounds coordinateToLogical and rejects fractional
    // logicalToCoordinate values. Interpolate actual bar pixels ourselves instead.
    const x = ax + (bx - ax) * (t - ta) / Math.max(1, tb - ta);
    const y = candle.priceToCoordinate(p);
    return x === null || y === null ? null : { x, y };
  };
}
export function drawingHandles(d: MarketDrawing, project: (t: number, p: number) => Pixel | null, width: number): Pixel[] {
  if (d.kind === "hline") { const a = project(0, d.price); return a ? [{ x: width / 2, y: a.y }] : []; }
  return drawingPoints(d).map(p => project(p.t, p.p)).filter((p): p is Pixel => p !== null);
}
export function drawingGeometry(d: MarketDrawing, project: (t: number, p: number) => Pixel | null, w: number, h: number): Primitive[] {
  if (d.hidden) return [];
  if (d.kind === "hline") { const a = project(0, d.price); return a ? [{ kind: "line", a: { x: 0, y: a.y }, b: { x: w, y: a.y }, label: d.price.toFixed(2) }] : []; }
  if (d.kind === "vline") { const a = project(d.t, 0); return a ? [{ kind: "line", a: { x: a.x, y: 0 }, b: { x: a.x, y: h } }] : []; }
  if (d.kind === "text") { const a = project(d.t, d.p); return a ? [{ kind: "text", a, label: d.text }] : []; }
  const a = project(d.t1, d.p1), b = project(d.t2, d.p2);
  if (!a || !b) return [];
  const line = (a: Pixel, b: Pixel, label?: string, color?: string): Primitive => ({ kind: "line", a, b, label, color });
  if (d.kind === "trend") return [line(a, b)];
  if (d.kind === "arrow") {
    const angle = Math.atan2(b.y - a.y, b.x - a.x), length = 12;
    return [line(a, b), line(b, { x: b.x - length * Math.cos(angle - 0.5), y: b.y - length * Math.sin(angle - 0.5) }), line(b, { x: b.x - length * Math.cos(angle + 0.5), y: b.y - length * Math.sin(angle + 0.5) })];
  }
  const extend = (a: Pixel, b: Pixel, both = true): Primitive[] => {
    const clipped = clipDrawingLine(a, b, w, h, both);
    return clipped ? [line(clipped.a, clipped.b)] : [];
  };
  if (d.kind === "ray" || d.kind === "extended") return extend(a, b, d.kind === "extended");
  if (d.kind === "rect" || d.kind === "ellipse") return [{ kind: d.kind, a, b }];
  if (d.kind === "fib") return FIB_LEVELS.flatMap(level => {
    const price = d.p1 + (d.p2 - d.p1) * level, p = project(d.t1, price);
    return p ? [line({ x: Math.min(a.x, b.x), y: p.y }, { x: Math.max(a.x, b.x), y: p.y }, `${(level * 100).toFixed(1)}% · ${price.toFixed(2)}`)] : [];
  });
  if (d.kind === "measure") return [{ kind: "rect", a, b }, line(a, b), { kind: "text", a: { x: Math.min(a.x, b.x) + 6, y: Math.min(a.y, b.y) + 18 }, label: `${(d.p2 - d.p1).toFixed(2)} (${d.p1 === 0 ? "—" : ((d.p2 / d.p1 - 1) * 100).toFixed(2) + "%"}) · ${Math.round(Math.abs(d.t2 - d.t1) / 86400)} 天` }];
  if (!("t3" in d)) return [];
  const c = project(d.t3, d.p3);
  if (!c) return [];
  if (d.kind === "channel") {
    const dx = b.x - a.x, dy = b.y - a.y;
    const parallel = { x: c.x + dx, y: c.y + dy };
    const midA = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
    return [...extend(a, b), ...extend(c, parallel), ...extend(midA, { x: midA.x + dx, y: midA.y + dy })];
  }
  const reward = d.kind === "long" ? d.p2 - d.p1 : d.p1 - d.p2;
  const risk = d.kind === "long" ? d.p1 - d.p3 : d.p3 - d.p1;
  const endX = Math.max(a.x + 50, b.x, c.x);
  return [
    { kind: "rect", a, b: { x: endX, y: b.y }, color: "#10b981" },
    { kind: "rect", a, b: { x: endX, y: c.y }, color: "#f43f5e" },
    line(a, { x: endX, y: a.y }, `入场 ${d.p1.toFixed(2)}`),
    line({ x: a.x, y: b.y }, { x: endX, y: b.y }, `目标 ${d.p2.toFixed(2)}`, "#10b981"),
    line({ x: a.x, y: c.y }, { x: endX, y: c.y }, `止损 ${d.p3.toFixed(2)}`, "#f43f5e"),
    { kind: "text", a: { x: a.x + 6, y: a.y + 18 }, label: risk > 0 && reward > 0 ? `盈亏比 ${(reward / risk).toFixed(2)}` : "请将目标／止损放在入场价正确方向" },
  ];
}
export function primitiveDistance(p: Pixel, shape: Primitive): number {
  const { a } = shape;
  if (shape.kind === "text") return Math.hypot(Math.max(a.x - p.x, 0, p.x - a.x - shape.label.length * 12), Math.max(a.y - 16 - p.y, 0, p.y - a.y - 4));
  const { b } = shape;
  if (shape.kind === "ellipse") {
    const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
    if (rx < 1 || ry < 1) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs(Math.hypot((p.x - (a.x + b.x) / 2) / rx, (p.y - (a.y + b.y) / 2) / ry) - 1) * Math.min(rx, ry);
  }
  if (shape.kind === "rect") {
    const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x), top = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y);
    if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) return Math.min(p.x - left, right - p.x, p.y - top, bottom - p.y);
    return Math.hypot(Math.max(left - p.x, 0, p.x - right), Math.max(top - p.y, 0, p.y - bottom));
  }
  const dx = b.x - a.x, dy = b.y - a.y, n = dx * dx + dy * dy;
  const f = n ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / n)) : 0;
  return Math.hypot(p.x - a.x - f * dx, p.y - a.y - f * dy);
}
