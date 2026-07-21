"use client";

import { useCallback, useRef, useState } from "react";
import type { KlineRangeStatsResult } from "@/lib/chart/klineRangeStats";

function fmtPrice(x: number): string {
  if (!Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1000) return x.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  if (a >= 1) return x.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
  return x.toLocaleString("zh-CN", { maximumFractionDigits: 6 });
}

function fmtVolZh(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1e8) return `${(v / 1e8).toFixed(3)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(3)} 万`;
  return v.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

type Props = {
  stats: KlineRangeStatsResult;
  /** 如「区间统计」「区间统计2」 */
  title: string;
  /** 标题与边框强调色（与 K 线区间两端竖线一致） */
  accentColor: string;
  /** 与主图 K 线涨跌配色一致 */
  upColor?: string;
  downColor?: string;
  /** 未手动拖动时，相对默认位置的纵向错位（多区间错开弹窗） */
  stackOffsetPx?: number;
  onClose: () => void;
};

export function KlineRangeStatsPanel({
  stats,
  title,
  accentColor,
  upColor = "#ef5350",
  downColor = "#26a69a",
  stackOffsetPx = 0,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const changeColor = stats.changePct >= 0 ? upColor : downColor;

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const node = panelRef.current;
      if (!node) return;
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);

      const clamp = (left: number, top: number) => {
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        const pad = 6;
        return {
          left: Math.max(pad, Math.min(left, window.innerWidth - w - pad)),
          top: Math.max(pad, Math.min(top, window.innerHeight - h - pad)),
        };
      };

      setPos(clamp(e.clientX - offsetX, e.clientY - offsetY));

      const onMove = (ev: PointerEvent) => {
        setPos(clamp(ev.clientX - offsetX, ev.clientY - offsetY));
      };
      const onUp = (ev: PointerEvent) => {
        el.releasePointerCapture(ev.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [],
  );

  return (
    <div
      ref={panelRef}
      className={`pointer-events-auto fixed z-[100] w-[min(96vw,420px)] rounded-lg border border-fs-border bg-fs-bg/95 px-4 py-3 text-fs-text shadow-xl backdrop-blur-sm ${
        pos ? "" : "left-1/2 -translate-x-1/2"
      }`}
      style={
        pos
          ? {
              left: pos.left,
              top: pos.top,
              borderColor: accentColor,
              boxShadow: `0 12px 40px rgba(0,0,0,0.12), 0 0 0 1px ${accentColor}33`,
            }
          : {
              left: "50%",
              top: stackOffsetPx
                ? `calc(22% + ${stackOffsetPx}px)`
                : "22%",
              transform: "translate(-50%, 0)",
              borderColor: accentColor,
              boxShadow: `0 12px 40px rgba(0,0,0,0.12), 0 0 0 1px ${accentColor}33`,
            }
      }
      role="dialog"
      aria-label={title}
    >
      <div
        className="mb-3 flex cursor-move touch-none select-none items-start justify-between gap-2 border-b border-fs-border pb-2"
        onPointerDown={handleDragStart}
      >
        <h3 className="text-sm font-semibold" style={{ color: accentColor }}>
          {title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="cursor-pointer rounded px-2 py-0.5 text-xs text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
        >
          关闭
        </button>
      </div>

      <div className="mb-3 grid gap-1 text-[11px] text-fs-muted">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            开始：<span className="text-fs-text">{stats.startLabel}</span>
          </span>
          <span>
            结束：<span className="text-fs-text">{stats.endLabel}</span>
          </span>
        </div>
        <div>
          K 线根数：<span className="font-mono text-fs-text">{stats.count}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-4">
        <Cell label="区间最高" value={fmtPrice(stats.maxHigh)} valueColor={upColor} />
        <Cell label="区间最低" value={fmtPrice(stats.minLow)} valueColor={downColor} />
        <Cell label="开盘(首根)" value={fmtPrice(stats.firstOpen)} />
        <Cell
          label="收盘(末根)"
          value={fmtPrice(stats.lastClose)}
          valueColor={changeColor}
        />

        <Cell
          label="涨跌幅"
          value={`${stats.changePct >= 0 ? "+" : ""}${stats.changePct.toFixed(2)}%`}
          valueColor={changeColor}
        />
        <Cell label="振幅" value={`${stats.amplitudePct.toFixed(2)}%`} />
        <Cell label="阳线" value={`${stats.upBars} 根`} valueColor={upColor} />
        <Cell label="阴线" value={`${stats.downBars} 根`} valueColor={downColor} />

        <Cell label="平盘" value={`${stats.flatBars} 根`} valueClass="text-fs-muted" />
        <Cell
          label="成交量合计"
          value={fmtVolZh(stats.totalVolume)}
          valueClass="text-fs-secondary"
        />
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-fs-secondary">
        涨跌幅按首根开盘价与末根收盘价计算；振幅为 (区间最高 − 区间最低) / 区间最低；成交量为区间内各柱之和（无数据时可能为估算）。
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  valueClass = "text-fs-text",
  valueColor,
}: {
  label: string;
  value: string;
  valueClass?: string;
  valueColor?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-fs-muted">{label}</div>
      <div
        className={`truncate font-mono text-xs ${valueColor ? "" : valueClass}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
