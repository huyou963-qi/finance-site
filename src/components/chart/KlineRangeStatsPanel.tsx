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
  onClose: () => void;
};

export function KlineRangeStatsPanel({ stats, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const upCls = "text-emerald-400";
  const downCls = "text-rose-400";
  const neuCls = "text-slate-200";

  const changeCls = stats.changePct >= 0 ? upCls : downCls;

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
      className={`pointer-events-auto fixed z-[100] w-[min(96vw,420px)] rounded-lg border border-[#3d4454] bg-[#1a1f2e]/98 px-4 py-3 shadow-2xl backdrop-blur-sm ${
        pos ? "" : "left-1/2 top-[22%] -translate-x-1/2"
      }`}
      style={pos ? { left: pos.left, top: pos.top } : undefined}
      role="dialog"
      aria-label="区间统计"
    >
      <div
        className="mb-3 flex cursor-move touch-none select-none items-start justify-between gap-2 border-b border-[#2b2f3a] pb-2"
        onPointerDown={handleDragStart}
      >
        <h3 className="text-sm font-semibold text-slate-100">区间统计</h3>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="cursor-pointer rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300"
        >
          关闭
        </button>
      </div>

      <div className="mb-3 grid gap-1 text-[11px] text-slate-400">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            开始：<span className="text-slate-200">{stats.startLabel}</span>
          </span>
          <span>
            结束：<span className="text-slate-200">{stats.endLabel}</span>
          </span>
        </div>
        <div>
          K 线根数：<span className="font-mono text-slate-200">{stats.count}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-4">
        <Cell label="区间最高" value={fmtPrice(stats.maxHigh)} valueClass={upCls} />
        <Cell label="区间最低" value={fmtPrice(stats.minLow)} valueClass={downCls} />
        <Cell label="开盘(首根)" value={fmtPrice(stats.firstOpen)} valueClass={neuCls} />
        <Cell label="收盘(末根)" value={fmtPrice(stats.lastClose)} valueClass={changeCls} />

        <Cell
          label="涨跌幅"
          value={`${stats.changePct >= 0 ? "+" : ""}${stats.changePct.toFixed(2)}%`}
          valueClass={changeCls}
        />
        <Cell
          label="振幅"
          value={`${stats.amplitudePct.toFixed(2)}%`}
          valueClass={neuCls}
        />
        <Cell label="阳线" value={`${stats.upBars} 根`} valueClass={upCls} />
        <Cell label="阴线" value={`${stats.downBars} 根`} valueClass={downCls} />

        <Cell label="平盘" value={`${stats.flatBars} 根`} valueClass="text-slate-400" />
        <Cell label="成交量合计" value={fmtVolZh(stats.totalVolume)} valueClass="text-amber-200/90" />
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
        涨跌幅按首根开盘价与末根收盘价计算；振幅为 (区间最高 − 区间最低) / 区间最低；成交量为区间内各柱之和（无数据时可能为估算）。
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-slate-500">{label}</div>
      <div className={`truncate font-mono text-xs ${valueClass}`}>{value}</div>
    </div>
  );
}
