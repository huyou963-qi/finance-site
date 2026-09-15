"use client";

import { useEffect, useState } from "react";

export type MacroChartDateRangeControlProps = {
  from: string | null;
  to: string | null;
  /** 时间轴首末日期，限制日期选择范围 */
  min: string | null;
  max: string | null;
  onChange: (from: string, to: string) => void;
  variant?: "desktop" | "mobile";
};

/** 手动输入年份时会先出现 0002、0020 这类中间值，只提交完整年份 */
function isCompleteDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1000;
}

/** 图表开始 / 结束日期：与底部时间导航条联动，选定后立即应用 */
export function MacroChartDateRangeControl({
  from,
  to,
  min,
  max,
  onChange,
  variant = "desktop",
}: MacroChartDateRangeControlProps) {
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? "");

  // 拖动底部导航条或切换数据集后，输入框跟随当前时间窗
  useEffect(() => {
    setDraftFrom(from ?? "");
  }, [from]);
  useEffect(() => {
    setDraftTo(to ?? "");
  }, [to]);

  const commit = (nextFrom: string, nextTo: string) => {
    if (!isCompleteDate(nextFrom) || !isCompleteDate(nextTo)) return;
    if (nextFrom > nextTo) return;
    onChange(nextFrom, nextTo);
  };

  const mobile = variant === "mobile";
  const inputClass = mobile
    ? "h-9 w-[7.5rem] min-w-0 rounded-md border border-fs-border bg-white px-1.5 text-fs-text"
    : "h-6 rounded border border-fs-border bg-fs-bg px-1 text-[11px] text-fs-text focus:border-fs-accent focus:outline-none";

  return (
    <div
      className={`flex shrink-0 items-center ${
        mobile ? "gap-1.5 text-[13px]" : "gap-1 rounded-md border border-fs-border/90 bg-fs-elevated px-1.5 py-0.5 text-[11px]"
      } text-fs-muted`}
      role="group"
      aria-label="图表时间区间"
    >
      {mobile ? null : <span className="shrink-0">区间</span>}
      <input
        type="date"
        value={draftFrom}
        min={min ?? undefined}
        max={draftTo || max || undefined}
        aria-label="开始日期"
        onChange={(e) => {
          setDraftFrom(e.target.value);
          commit(e.target.value, draftTo);
        }}
        onBlur={() => setDraftFrom(from ?? "")}
        className={inputClass}
      />
      <span className="shrink-0">至</span>
      <input
        type="date"
        value={draftTo}
        min={draftFrom || min || undefined}
        max={max ?? undefined}
        aria-label="结束日期"
        onChange={(e) => {
          setDraftTo(e.target.value);
          commit(draftFrom, e.target.value);
        }}
        onBlur={() => setDraftTo(to ?? "")}
        className={inputClass}
      />
    </div>
  );
}
