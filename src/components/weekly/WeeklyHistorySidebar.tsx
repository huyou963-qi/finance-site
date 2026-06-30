"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WeeklyReportListItem } from "@/lib/data/weeklyReports";
import {
  RECENT_SIDEBAR_COUNT,
  buildSidebarDisplayList,
  findLatestInPreviousMonth,
  findLatestInPreviousQuarter,
  findLatestReport,
  findReportForIsoWeek,
  regimeShort,
  weekEndingToIsoWeekValue,
} from "@/lib/weekly/sidebarNav";

type QuickFilter = "latest" | "prevMonth" | "prevQuarter" | null;

function SidebarCard({
  item,
  active,
  pinned,
  onClick,
}: {
  item: WeeklyReportListItem;
  active: boolean;
  pinned?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-2 w-full rounded-lg border px-3 py-2.5 text-left transition ${
        active
          ? "border-fs-accent/30 bg-fs-accent-soft/50"
          : "border-fs-border bg-fs-elevated hover:border-fs-border hover:bg-fs-elevated"
      }`}
    >
      {pinned ? (
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-fs-accent/90">
          当前选中
        </div>
      ) : null}
      <div className="text-sm font-semibold text-fs-text">{item.meta.weekEnding}</div>
      <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-fs-muted">
        {item.meta.title}
      </div>
      <div className="mt-2 inline-block rounded bg-fs-elevated px-2 py-0.5 text-[11px] text-fs-secondary">
        {regimeShort(item.meta.regime)}
      </div>
    </button>
  );
}

const pillBase =
  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition";

export function WeeklyHistorySidebar({
  list,
  total,
  selectedId,
  onSelect,
}: {
  list: WeeklyReportListItem[];
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [weekInput, setWeekInput] = useState("");
  const [jumpError, setJumpError] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("latest");

  useEffect(() => {
    const sel = list.find((r) => r.id === selectedId);
    if (sel) setWeekInput(weekEndingToIsoWeekValue(sel.meta.weekEnding));
  }, [list, selectedId]);

  const { items: displayItems, pinnedOutsideRecent } = useMemo(
    () => buildSidebarDisplayList(list, selectedId, RECENT_SIDEBAR_COUNT),
    [list, selectedId],
  );

  const olderCount = Math.max(0, total - RECENT_SIDEBAR_COUNT);

  const applyQuick = useCallback(
    (filter: QuickFilter) => {
      setJumpError(null);
      setQuickFilter(filter);
      let target: WeeklyReportListItem | null = null;
      if (filter === "latest") target = findLatestReport(list);
      else if (filter === "prevMonth") target = findLatestInPreviousMonth(list);
      else if (filter === "prevQuarter") target = findLatestInPreviousQuarter(list);
      if (target) onSelect(target.id);
      else if (filter === "prevMonth") setJumpError("上月暂无周报");
      else if (filter === "prevQuarter") setJumpError("上季度暂无周报");
    },
    [list, onSelect],
  );

  const handleJump = useCallback(() => {
    setJumpError(null);
    setQuickFilter(null);
    const found = findReportForIsoWeek(list, weekInput);
    if (found) {
      onSelect(found.id);
      return;
    }
    setJumpError("该周暂无周报，请换一周");
  }, [list, onSelect, weekInput]);

  const handleCardSelect = useCallback(
    (id: string) => {
      setJumpError(null);
      setQuickFilter(null);
      onSelect(id);
    },
    [onSelect],
  );

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-fs-border bg-fs-elevated lg:w-80">
      <div className="shrink-0 border-b border-fs-border p-3">
        <div className="text-xs font-medium text-fs-muted">历史周报</div>
        <div className="mt-2 text-[11px] text-fs-muted">跳转到周</div>
        <div className="mt-1.5 flex gap-2">
          <input
            type="week"
            value={weekInput}
            onChange={(e) => {
              setWeekInput(e.target.value);
              setJumpError(null);
            }}
            className="min-w-0 flex-1 rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-xs text-fs-text outline-none focus:border-fs-accent/40 focus:ring-1 focus:ring-fs-accent/30"
            aria-label="选择 ISO 周"
          />
          <button
            type="button"
            onClick={handleJump}
            className="shrink-0 rounded-md border border-fs-border bg-fs-elevated px-2.5 py-1.5 text-xs font-medium text-fs-text transition hover:border-fs-border hover:bg-fs-border hover:text-fs-text"
          >
            跳转
          </button>
        </div>
        {jumpError ? <p className="mt-1.5 text-[11px] text-amber-400/90">{jumpError}</p> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => applyQuick("latest")}
            className={`${pillBase} ${
              quickFilter === "latest"
                ? "border-fs-accent/30 bg-fs-accent-soft text-fs-accent-text"
                : "border-fs-border text-fs-muted hover:border-fs-border hover:text-fs-text"
            }`}
          >
            最新
          </button>
          <button
            type="button"
            onClick={() => applyQuick("prevMonth")}
            className={`${pillBase} ${
              quickFilter === "prevMonth"
                ? "border-fs-accent/30 bg-fs-accent-soft text-fs-accent-text"
                : "border-fs-border text-fs-muted hover:border-fs-border hover:text-fs-text"
            }`}
          >
            上月
          </button>
          <button
            type="button"
            onClick={() => applyQuick("prevQuarter")}
            className={`${pillBase} ${
              quickFilter === "prevQuarter"
                ? "border-fs-accent/30 bg-fs-accent-soft text-fs-accent-text"
                : "border-fs-border text-fs-muted hover:border-fs-border hover:text-fs-text"
            }`}
          >
            上季度
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 pt-2">
        {displayItems.map((item) => (
          <SidebarCard
            key={item.id}
            item={item}
            active={item.id === selectedId}
            pinned={pinnedOutsideRecent && item.id === selectedId}
            onClick={() => handleCardSelect(item.id)}
          />
        ))}
        {olderCount > 0 ? (
          <p className="mt-1 px-1 text-[11px] leading-relaxed text-fs-muted">
            … 更早 {olderCount} 条，请用上方周选择器跳转
          </p>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-fs-border px-3 py-2 text-[11px] text-fs-muted">
        共 {total} 条 · 按截至日期倒序
      </div>
    </aside>
  );
}
