"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CandlestickData, IChartApi } from "lightweight-charts";

type Props = {
  chart: IChartApi | null;
  candles: CandlestickData[];
};

/** 可视区间最少 K 线根数 */
const MIN_SPAN = 5;

function clampRange(
  from: number,
  to: number,
  maxIndex: number,
): { from: number; to: number } {
  let f = Math.max(0, Math.min(from, maxIndex));
  let t = Math.max(0, Math.min(to, maxIndex));
  if (t <= f) t = Math.min(maxIndex, f + 0.25);
  if (t - f < MIN_SPAN - 1) {
    const mid = (f + t) / 2;
    const half = (MIN_SPAN - 1) / 2;
    f = Math.max(0, mid - half);
    t = Math.min(maxIndex, f + (MIN_SPAN - 1));
    f = Math.max(0, t - (MIN_SPAN - 1));
  }
  return { from: f, to: t };
}

export function ChartTimeRangeBrush({ chart, candles }: Props) {
  const n = candles.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<{ from: number; to: number } | null>(
    null,
  );

  useEffect(() => {
    if (!chart || n < MIN_SPAN) {
      setVisible(null);
      return;
    }
    const sync = () => {
      const v = chart.timeScale().getVisibleLogicalRange();
      if (v) setVisible({ from: v.from, to: v.to });
    };
    sync();
    chart.timeScale().subscribeVisibleLogicalRangeChange(sync);
    return () =>
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(sync);
  }, [chart, n]);

  const applyRange = useCallback(
    (from: number, to: number) => {
      if (!chart || n < MIN_SPAN) return;
      const { from: f, to: t } = clampRange(from, to, n - 1);
      chart.timeScale().setVisibleLogicalRange({ from: f, to: t });
    },
    [chart, n],
  );

  const xToIndex = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || n < 2) return 0;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return p * (n - 1);
    },
    [n],
  );

  const attachDrag = useCallback(
    (
      mode: "left" | "right" | "pan",
      startClientX: number,
      startFrom: number,
      startTo: number,
    ) => {
      const onMove = (ev: PointerEvent) => {
        if (!chart || n < MIN_SPAN) return;
        const idx = xToIndex(ev.clientX);
        if (mode === "left") {
          applyRange(idx, startTo);
        } else if (mode === "right") {
          applyRange(startFrom, idx);
        } else {
          const r = trackRef.current?.getBoundingClientRect();
          if (!r || n < 2) return;
          const dxIdx = ((ev.clientX - startClientX) / r.width) * (n - 1);
          const span = startTo - startFrom;
          let nf = startFrom + dxIdx;
          let nt = startTo + dxIdx;
          if (nf < 0) {
            nf = 0;
            nt = span;
          }
          if (nt > n - 1) {
            nt = n - 1;
            nf = nt - span;
          }
          applyRange(nf, nt);
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [applyRange, chart, n, xToIndex],
  );

  const onPointerDownLeft = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!visible) return;
    attachDrag("left", e.clientX, visible.from, visible.to);
  };

  const onPointerDownRight = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!visible) return;
    attachDrag("right", e.clientX, visible.from, visible.to);
  };

  const onPointerDownBody = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!visible) return;
    attachDrag("pan", e.clientX, visible.from, visible.to);
  };

  const onTrackOnlyPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!visible) return;
    const idx = xToIndex(e.clientX);
    const spanWin = visible.to - visible.from;
    applyRange(idx - spanWin / 2, idx + spanWin / 2);
  };

  if (!chart || n < MIN_SPAN || !visible) return null;

  const maxI = n - 1;
  const leftPct = Math.min(100, Math.max(0, (visible.from / maxI) * 100));
  const rightPct = Math.min(100, Math.max(0, (visible.to / maxI) * 100));
  const wPct = Math.max(0.5, rightPct - leftPct);

  const closes = candles.map((c) => c.close);
  const hi = Math.max(...closes);
  const lo = Math.min(...closes);
  const span = hi - lo || 1;
  const pts = closes.map((c, i) => {
    const x = maxI > 0 ? (i / maxI) * 100 : 0;
    const y = 100 - ((c - lo) / span) * 100;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  const pathD = pts.join(" ");

  return (
    <div className="border-t border-fs-border px-2 py-2">
      <div
        ref={trackRef}
        className="relative h-10 w-full cursor-pointer rounded bg-[#1e222d]"
        onPointerDown={onTrackOnlyPointerDown}
        role="presentation"
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full text-fs-secondary"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className="pointer-events-auto absolute top-0 bottom-0 border-x border-amber-500/70 bg-amber-500/15"
          style={{
            left: `${leftPct}%`,
            width: `${wPct}%`,
          }}
          onPointerDown={onPointerDownBody}
        />
        <button
          type="button"
          aria-label="拖动左边界"
          className="pointer-events-auto absolute top-0 bottom-0 z-[1] w-3 -translate-x-1/2 cursor-ew-resize border-0 bg-amber-500/90 p-0 hover:bg-amber-400"
          style={{ left: `${leftPct}%` }}
          onPointerDown={onPointerDownLeft}
        />
        <button
          type="button"
          aria-label="拖动右边界"
          className="pointer-events-auto absolute top-0 bottom-0 z-[1] w-3 -translate-x-1/2 cursor-ew-resize border-0 bg-amber-500/90 p-0 hover:bg-amber-400"
          style={{ left: `${rightPct}%` }}
          onPointerDown={onPointerDownRight}
        />
      </div>
    </div>
  );
}
