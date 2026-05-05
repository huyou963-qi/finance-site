"use client";

import type { ISeriesApi, IChartApi, Time } from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";

/** 使用 SVG 叠加的图形（竖线、矩形、斐波那契、文本） */
export type SvgOverlayShape =
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
      /** 第三条边上的点，确定与基准线平行的下轨位置 */
      t3: UTCTimestamp;
      p3: number;
      color: string;
    };

/** 线段与视口 [0,w]×[0,h] 求交（Liang–Barsky） */
function clipSegmentToViewport(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  h: number,
): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, x0 - 0)) return null;
  if (!clip(dx, w - x0)) return null;
  if (!clip(-dy, y0 - 0)) return null;
  if (!clip(dy, h - y0)) return null;
  if (t0 > t1) return null;
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

/** 多点画线草稿：已定点 + 鼠标跟随预览（虚线） */
export type DrawingDraftPreview = {
  tool: "trend" | "rect" | "fib" | "channel";
  placed: Array<{ t: UTCTimestamp; p: number }>;
  hover: { t: UTCTimestamp; p: number } | null;
};

function clipInfiniteLinePx(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  w: number,
  h: number,
): [number, number, number, number] | null {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const ux = dx / len;
  const uy = dy / len;
  const ext = Math.max(w, h) * 4;
  return clipSegmentToViewport(
    ax - ux * ext,
    ay - uy * ext,
    ax + ux * ext,
    ay + uy * ext,
    w,
    h,
  );
}

type Props = {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick", Time> | null;
  shapes: SvgOverlayShape[];
  width: number;
  height: number;
  draftPreview?: DrawingDraftPreview | null;
  /** 选中高亮（与 PersistedDrawing.id 一致） */
  selectedShapeId?: string | null;
};

export function ChartDrawingOverlay({
  chart,
  candleSeries,
  shapes,
  width,
  height,
  draftPreview,
  selectedShapeId = null,
}: Props) {
  if (!chart || !candleSeries || width <= 0) return null;

  const timeScale = chart.timeScale();

  const project = (t: UTCTimestamp, price: number) => {
    const x = timeScale.timeToCoordinate(t as Time);
    const y = candleSeries.priceToCoordinate(price);
    if (x === null || y === null) return null;
    return { x, y };
  };

  const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  const lines: React.ReactNode[] = [];
  const rects: React.ReactNode[] = [];

  for (const s of shapes) {
    const sel = selectedShapeId === s.id;
    const sw = sel ? 2 : 1;
    const swThin = sel ? 1.5 : 1;
    if (s.kind === "vline") {
      const x = timeScale.timeToCoordinate(s.t as Time);
      if (x === null) continue;
      lines.push(
        <line
          key={s.id}
          x1={x}
          x2={x}
          y1={0}
          y2={height}
          stroke={sel ? "#e2e8f0" : s.color}
          strokeWidth={sw}
          strokeDasharray="4 3"
        />,
      );
    }
    if (s.kind === "rect") {
      const a = project(s.t1, s.p1);
      const b = project(s.t2, s.p2);
      if (!a || !b) continue;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      rects.push(
        <rect
          key={s.id}
          x={x}
          y={y}
          width={w}
          height={h}
          fill={`${s.color}33`}
          stroke={sel ? "#e2e8f0" : s.color}
          strokeWidth={sw}
        />,
      );
    }
    if (s.kind === "fib") {
      const hi = Math.max(s.p1, s.p2);
      const lo = Math.min(s.p1, s.p2);
      const range = hi - lo;
      if (range <= 0) continue;
      const tMid = s.t1;
      for (let i = 0; i < fibLevels.length; i++) {
        const lv = fibLevels[i]!;
        const price = hi - lv * range;
        const y = candleSeries.priceToCoordinate(price);
        if (y === null) continue;
        const label = `${(lv * 100).toFixed(1)}%`;
        const fibStroke = sel ? "#e2e8f0" : s.color;
        lines.push(
          <g key={`${s.id}-fib-${i}`}>
            <line
              x1={0}
              x2={width}
              y1={y}
              y2={y}
              stroke={fibStroke}
              strokeWidth={swThin}
              strokeOpacity={0.7}
              strokeDasharray="6 4"
            />
            <text
              x={width - 4}
              y={y - 2}
              fill={fibStroke}
              fontSize={10}
              textAnchor="end"
            >
              {label}
            </text>
          </g>,
        );
      }
      const xRef = timeScale.timeToCoordinate(tMid as Time);
      if (xRef !== null) {
        lines.push(
          <text
            key={`${s.id}-fib-lab`}
            x={xRef + 4}
            y={12}
            fill={sel ? "#e2e8f0" : s.color}
            fontSize={10}
          >
            斐波那契
          </text>,
        );
      }
    }
    if (s.kind === "text") {
      const pt = project(s.t, s.p);
      if (!pt) continue;
      lines.push(
        <text
          key={s.id}
          x={pt.x + 4}
          y={pt.y}
          fill={sel ? "#f8fafc" : s.color}
          fontSize={12}
          fontWeight={sel ? 600 : 400}
        >
          {s.text}
        </text>,
      );
    }
    if (s.kind === "channel") {
      const A = project(s.t1, s.p1);
      const B = project(s.t2, s.p2);
      const C = project(s.t3, s.p3);
      if (!A || !B || !C) continue;
      const col = sel ? "#e2e8f0" : s.color;
      const L1 = clipInfiniteLinePx(A.x, A.y, B.x, B.y, width, height);
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const ux = dx / len;
      const uy = dy / len;
      const ext = Math.max(width, height) * 4;
      const L2 = clipInfiniteLinePx(
        C.x - ux * ext,
        C.y - uy * ext,
        C.x + ux * ext,
        C.y + uy * ext,
        width,
        height,
      );
      if (L1) {
        lines.push(
          <line
            key={`${s.id}-ch1`}
            x1={L1[0]}
            y1={L1[1]}
            x2={L1[2]}
            y2={L1[3]}
            stroke={col}
            strokeWidth={sw}
          />,
        );
      }
      if (L2) {
        lines.push(
          <line
            key={`${s.id}-ch2`}
            x1={L2[0]}
            y1={L2[1]}
            x2={L2[2]}
            y2={L2[3]}
            stroke={col}
            strokeWidth={swThin}
            strokeDasharray="6 4"
          />,
        );
      }
    }
  }

  const draftNodes: React.ReactNode[] = [];
  const dp = draftPreview;
  if (dp && dp.placed.length > 0) {
    const anchorStroke = "#06b6d4";
    const guideStroke = "#38bdf8";
    for (let i = 0; i < dp.placed.length; i++) {
      const pt = dp.placed[i]!;
      const px = project(pt.t, pt.p);
      if (!px) continue;
      draftNodes.push(
        <circle
          key={`draft-a-${i}`}
          cx={px.x}
          cy={px.y}
          r={4}
          fill={anchorStroke}
          stroke="#0e7490"
          strokeWidth={1}
        />,
      );
    }
    const hover = dp.hover;
    if (hover) {
      const last = dp.placed[dp.placed.length - 1]!;
      const a = project(last.t, last.p);
      const b = project(hover.t, hover.p);
      if (a && b) {
        if (dp.tool === "rect") {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const rw = Math.abs(a.x - b.x);
          const rh = Math.abs(a.y - b.y);
          draftNodes.push(
            <rect
              key="draft-rect"
              x={x}
              y={y}
              width={rw}
              height={rh}
              fill={`${guideStroke}22`}
              stroke={guideStroke}
              strokeWidth={1}
              strokeDasharray="5 4"
            />,
          );
        } else {
          draftNodes.push(
            <line
              key="draft-seg"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={guideStroke}
              strokeWidth={1}
              strokeDasharray="6 4"
              strokeOpacity={0.95}
            />,
          );
        }
      }
      if (
        dp.tool === "channel" &&
        dp.placed.length === 2 &&
        hover &&
        a &&
        b
      ) {
        const p0 = dp.placed[0]!;
        const p1 = dp.placed[1]!;
        const A0 = project(p0.t, p0.p);
        const B0 = project(p1.t, p1.p);
        const H = project(hover.t, hover.p);
        if (A0 && B0 && H) {
          const dx = B0.x - A0.x;
          const dy = B0.y - A0.y;
          const len = Math.hypot(dx, dy);
          if (len > 1e-9) {
            const ux = dx / len;
            const uy = dy / len;
            const ext = Math.max(width, height) * 4;
            const Lpar = clipInfiniteLinePx(
              H.x - ux * ext,
              H.y - uy * ext,
              H.x + ux * ext,
              H.y + uy * ext,
              width,
              height,
            );
            if (Lpar) {
              draftNodes.push(
                <line
                  key="draft-ch-par"
                  x1={Lpar[0]}
                  y1={Lpar[1]}
                  x2={Lpar[2]}
                  y2={Lpar[3]}
                  stroke="#fbbf24"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  strokeOpacity={0.85}
                />,
              );
            }
          }
        }
      }
    }
  }

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-10"
      width={width}
      height={height}
    >
      {rects}
      {lines}
      {draftNodes}
    </svg>
  );
}
