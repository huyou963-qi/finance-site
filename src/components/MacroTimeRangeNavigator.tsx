"use client";

import { useCallback, useMemo, useRef } from "react";

export type MacroTimeRangeNavigatorProps = {
  categories: string[];
  /** @deprecated 数据预览已关闭，保留以兼容调用方传参 */
  previewData?: (number | null)[];
  /** 0–100，与 ECharts dataZoom 一致 */
  rangePct: { start: number; end: number };
  onRangePctChange: (next: { start: number; end: number }) => void;
  className?: string;
};

const MIN_SPAN_PCT = 1;
/** 相邻刻度标签最小水平间距（%），避免右端挤叠 */
const MIN_LABEL_GAP_PCT = 9;
const MAX_LABEL_TICKS = 11;

function buildLabelTicks(categories: string[]): { pct: number; label: string }[] {
  const n = categories.length;
  if (n === 0) return [];
  if (n === 1) return [{ pct: 0, label: categories[0]! }];

  const indices = new Set<number>([0, n - 1]);
  const innerSlots = MAX_LABEL_TICKS - 2;
  if (innerSlots > 0 && n > 2) {
    for (let k = 1; k <= innerSlots; k++) {
      indices.add(Math.round((k / (innerSlots + 1)) * (n - 1)));
    }
  }

  const sorted = [...indices].sort((a, b) => a - b);
  const raw = sorted.map((i) => ({
    pct: (i / (n - 1)) * 100,
    label: categories[i]!,
    index: i,
  }));

  const out: typeof raw = [raw[0]!];
  const last = raw[raw.length - 1]!;

  for (let j = 1; j < raw.length - 1; j++) {
    const t = raw[j]!;
    const prev = out[out.length - 1]!;
    if (t.pct - prev.pct >= MIN_LABEL_GAP_PCT && last.pct - t.pct >= MIN_LABEL_GAP_PCT) {
      out.push(t);
    }
  }

  const prev = out[out.length - 1]!;
  if (last.index !== prev.index) {
    if (last.pct - prev.pct < MIN_LABEL_GAP_PCT) {
      out[out.length - 1] = last;
    } else {
      out.push(last);
    }
  }

  return out.map(({ pct, label }) => ({ pct, label }));
}

function clampRangePct(start: number, end: number): { start: number; end: number } {
  let s = Math.max(0, Math.min(100, start));
  let e = Math.max(0, Math.min(100, end));
  if (e <= s) e = Math.min(100, s + MIN_SPAN_PCT);
  if (e - s < MIN_SPAN_PCT) e = Math.min(100, s + MIN_SPAN_PCT);
  return { start: s, end: e };
}

/**
 * 图表下方时间范围导航：纯 HTML 滑块（无 ECharts），避免 dataZoom/series 触发的 getRawIndex 运行时错误。
 * 父组件根据 rangePct 自行切片各序列数据。
 */
export function MacroTimeRangeNavigator({
  categories,
  rangePct,
  onRangePctChange,
  className,
}: MacroTimeRangeNavigatorProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const n = categories.length;

  const labelTicks = useMemo(() => buildLabelTicks(categories), [categories]);

  const xToPct = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
  }, []);

  const applyRange = useCallback(
    (start: number, end: number) => {
      onRangePctChange(clampRangePct(start, end));
    },
    [onRangePctChange],
  );

  const attachDrag = useCallback(
    (
      mode: "left" | "right" | "pan",
      startClientX: number,
      startStart: number,
      startEnd: number,
    ) => {
      const onMove = (ev: PointerEvent) => {
        const pct = xToPct(ev.clientX);
        if (mode === "left") {
          applyRange(pct, startEnd);
        } else if (mode === "right") {
          applyRange(startStart, pct);
        } else {
          const el = trackRef.current;
          if (!el) return;
          const w = el.getBoundingClientRect().width;
          if (w <= 0) return;
          const dxPct = ((ev.clientX - startClientX) / w) * 100;
          const span = startEnd - startStart;
          let ns = startStart + dxPct;
          let ne = startEnd + dxPct;
          if (ns < 0) {
            ns = 0;
            ne = span;
          }
          if (ne > 100) {
            ne = 100;
            ns = ne - span;
          }
          applyRange(ns, ne);
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
    [applyRange, xToPct],
  );

  if (n === 0) return null;

  const leftPct = rangePct.start;
  const rightPct = rangePct.end;
  const wPct = Math.max(0.5, rightPct - leftPct);

  return (
    <div
      className={`shrink-0 ${className ?? ""}`}
      style={{ minHeight: 44, height: 44, width: "100%" }}
    >
      {/* 与主图 grid left≈52 对齐 */}
      <div className="flex h-full flex-col pl-[52px] pr-5">
        <div
          ref={trackRef}
          className="relative mt-1 h-[18px] w-full cursor-pointer rounded border border-fs-border/80 bg-fs-elevated"
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            const pct = xToPct(e.clientX);
            const span = rangePct.end - rangePct.start;
            applyRange(pct - span / 2, pct + span / 2);
          }}
          role="presentation"
        >
          <div
            className="absolute inset-y-0 border-x border-fs-accent/60 bg-fs-accent-soft"
            style={{ left: `${leftPct}%`, width: `${wPct}%` }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              attachDrag("pan", e.clientX, rangePct.start, rangePct.end);
            }}
          />
          <button
            type="button"
            aria-label="拖动左边界"
            className="absolute top-0 bottom-0 z-[1] w-2 -translate-x-1/2 cursor-ew-resize border-0 bg-fs-elevated p-0 hover:bg-fs-accent-soft"
            style={{ left: `${leftPct}%` }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              attachDrag("left", e.clientX, rangePct.start, rangePct.end);
            }}
          />
          <button
            type="button"
            aria-label="拖动右边界"
            className="absolute top-0 bottom-0 z-[1] w-2 -translate-x-1/2 cursor-ew-resize border-0 bg-fs-elevated p-0 hover:bg-fs-accent-soft"
            style={{ left: `${rightPct}%` }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              attachDrag("right", e.clientX, rangePct.start, rangePct.end);
            }}
          />
        </div>
        <div className="relative mt-0.5 h-[18px] w-full text-[10px] text-fs-muted">
          {labelTicks.map((t, i) => {
            const isFirst = i === 0;
            const isLast = i === labelTicks.length - 1;
            const tickClass = isFirst
              ? "absolute top-0 left-0 whitespace-nowrap"
              : isLast
                ? "absolute top-0 right-0 whitespace-nowrap text-right"
                : "absolute top-0 -translate-x-1/2 whitespace-nowrap";
            return (
              <span
                key={`${i}-${t.label}`}
                className={tickClass}
                style={isFirst || isLast ? undefined : { left: `${t.pct}%` }}
              >
                {t.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
