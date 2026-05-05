import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";

/** 与 StockChartWorkspace `PersistedDrawing` 一致（避免循环依赖重复导出时可内联） */
export type DrawingHitTarget =
  | { id: string; kind: "hline"; price: number }
  | {
      id: string;
      kind: "trend";
      t1: number;
      p1: number;
      t2: number;
      p2: number;
    }
  | { id: string; kind: "vline"; t: UTCTimestamp; color: string }
  | {
      id: string;
      kind: "rect";
      t1: UTCTimestamp;
      p1: number;
      t2: UTCTimestamp;
      p2: number;
      color: string;
    }
  | {
      id: string;
      kind: "fib";
      t1: UTCTimestamp;
      p1: number;
      t2: UTCTimestamp;
      p2: number;
      color: string;
    }
  | {
      id: string;
      kind: "text";
      t: UTCTimestamp;
      p: number;
      text: string;
      color: string;
    }
  | {
      id: string;
      kind: "channel";
      t1: UTCTimestamp;
      p1: number;
      t2: UTCTimestamp;
      p2: number;
      t3: UTCTimestamp;
      p3: number;
      color: string;
    };

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-14) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const nx = ax + t * dx;
  const ny = ay + t * dy;
  return Math.hypot(px - nx, py - ny);
}

function distPointToInfiniteLine(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(px - ax, py - ay);
  return Math.abs((px - ax) * dy - (py - ay) * dx) / len;
}

function distPointToAxisAlignedRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): number {
  const dx = px < rx ? rx - px : px > rx + rw ? px - (rx + rw) : 0;
  const dy = py < ry ? ry - py : py > ry + rh ? py - (ry + rh) : 0;
  return Math.hypot(dx, dy);
}

export function hitTestDrawing(
  px: number,
  py: number,
  d: DrawingHitTarget,
  chart: IChartApi,
  candle: ISeriesApi<"Candlestick", Time>,
  width: number,
  height: number,
  tol: number,
): boolean {
  const ts = chart.timeScale();
  const project = (t: UTCTimestamp, price: number) => {
    const x = ts.timeToCoordinate(t as Time);
    const y = candle.priceToCoordinate(price);
    if (x === null || y === null) return null;
    return { x, y };
  };

  switch (d.kind) {
    case "hline": {
      const cy = candle.priceToCoordinate(d.price);
      if (cy === null) return false;
      return Math.abs(py - cy) <= tol && px >= 0 && px <= width;
    }
    case "trend": {
      const a = project(d.t1 as UTCTimestamp, d.p1);
      const b = project(d.t2 as UTCTimestamp, d.p2);
      if (!a || !b) return false;
      return distPointToSegment(px, py, a.x, a.y, b.x, b.y) <= tol;
    }
    case "vline": {
      const vx = ts.timeToCoordinate(d.t as Time);
      if (vx === null) return false;
      return (
        Math.abs(px - vx) <= tol && py >= 0 && py <= height
      );
    }
    case "rect": {
      const a = project(d.t1, d.p1);
      const b = project(d.t2, d.p2);
      if (!a || !b) return false;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      return distPointToAxisAlignedRect(px, py, x, y, w, h) <= tol;
    }
    case "fib": {
      const hi = Math.max(d.p1, d.p2);
      const lo = Math.min(d.p1, d.p2);
      const range = hi - lo;
      if (range <= 0) return false;
      for (const lv of FIB_LEVELS) {
        const price = hi - lv * range;
        const fy = candle.priceToCoordinate(price);
        if (fy === null) continue;
        if (Math.abs(py - fy) <= tol && px >= 0 && px <= width) {
          return true;
        }
      }
      return false;
    }
    case "text": {
      const pt = project(d.t, d.p);
      if (!pt) return false;
      const tx = pt.x + 4;
      const ty = pt.y;
      return Math.hypot(px - tx, py - ty) <= Math.max(tol, 28);
    }
    case "channel": {
      const A = project(d.t1, d.p1);
      const B = project(d.t2, d.p2);
      const C = project(d.t3, d.p3);
      if (!A || !B || !C) return false;
      const d1 = distPointToInfiniteLine(px, py, A.x, A.y, B.x, B.y);
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) return false;
      const ux = dx / len;
      const uy = dy / len;
      const d2 = distPointToInfiniteLine(
        px,
        py,
        C.x - ux * width,
        C.y - uy * width,
        C.x + ux * width,
        C.y + uy * width,
      );
      return Math.min(d1, d2) <= tol;
    }
  }
}

/** 从后往前（后绘制的在上层）取第一个命中的图形 id */
export function pickDrawingAt(
  px: number,
  py: number,
  drawings: DrawingHitTarget[],
  chart: IChartApi,
  candle: ISeriesApi<"Candlestick", Time>,
  width: number,
  height: number,
  tolerancePx = 10,
): string | null {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i]!;
    if (
      hitTestDrawing(
        px,
        py,
        d,
        chart,
        candle,
        width,
        height,
        tolerancePx,
      )
    ) {
      return d.id;
    }
  }
  return null;
}
