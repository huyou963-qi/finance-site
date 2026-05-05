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
    };

type Props = {
  chart: IChartApi | null;
  candleSeries: ISeriesApi<"Candlestick", Time> | null;
  shapes: SvgOverlayShape[];
  width: number;
  height: number;
};

export function ChartDrawingOverlay({
  chart,
  candleSeries,
  shapes,
  width,
  height,
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
          stroke={s.color}
          strokeWidth={1}
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
          stroke={s.color}
          strokeWidth={1}
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
        lines.push(
          <g key={`${s.id}-fib-${i}`}>
            <line
              x1={0}
              x2={width}
              y1={y}
              y2={y}
              stroke={s.color}
              strokeWidth={1}
              strokeOpacity={0.7}
              strokeDasharray="6 4"
            />
            <text
              x={width - 4}
              y={y - 2}
              fill={s.color}
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
            fill={s.color}
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
          fill={s.color}
          fontSize={12}
        >
          {s.text}
        </text>,
      );
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
    </svg>
  );
}
