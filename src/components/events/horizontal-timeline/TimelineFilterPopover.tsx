"use client";

import { useEffect, useRef, useState } from "react";
import type { EventImportance } from "@/lib/data/marketEvents";
import { EVENT_IMPORTANCE_LABELS } from "@/lib/data/marketEvents";
import { MACRO_COUNTRIES } from "@/lib/data/macroCatalog";
import {
  DEFAULT_TIMELINE_FILTERS,
  hasActiveTimelineFilters,
  TIMELINE_FILTER_EVENT_TYPES,
  toggleFilterItem,
  type TimelineFilterState,
} from "@/components/events/horizontal-timeline/timelineFilters";

const IMPORTANCE_OPTIONS = (
  Object.keys(EVENT_IMPORTANCE_LABELS) as EventImportance[]
).map((k) => ({ value: k, label: EVENT_IMPORTANCE_LABELS[k] }));

type TimelineFilterPopoverProps = {
  filters: TimelineFilterState;
  onChange: (next: TimelineFilterState) => void;
};

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[10px] transition ${
        active
          ? "border-fs-accent/40 bg-fs-accent-soft text-fs-accent-text"
          : "border-fs-border text-fs-secondary hover:border-fs-accent/25 hover:bg-fs-elevated"
      }`}
    >
      {label}
    </button>
  );
}

export function TimelineFilterPopover({ filters, onChange }: TimelineFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = hasActiveTimelineFilters(filters);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const patch = (p: Partial<TimelineFilterState>) => onChange({ ...filters, ...p });

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] shadow-sm backdrop-blur transition ${
          active || open
            ? "border-fs-accent/35 bg-fs-accent-soft/50 text-fs-accent-text"
            : "border-fs-border bg-white/95 text-fs-secondary hover:bg-fs-elevated"
        }`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
        </svg>
        筛选
        {active ? (
          <span className="h-1.5 w-1.5 rounded-full bg-fs-accent" aria-label="已启用筛选" />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="时间轴筛选"
          className="absolute right-0 top-full z-[70] mt-1.5 w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-fs-border bg-white p-3 shadow-lg"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-fs-text">筛选条件</p>
            {active ? (
              <button
                type="button"
                onClick={() => onChange({ ...DEFAULT_TIMELINE_FILTERS })}
                className="text-[10px] text-fs-muted hover:text-fs-text"
              >
                重置
              </button>
            ) : null}
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-[10px] font-medium text-fs-muted">国家</span>
            <select
              value={filters.country}
              onChange={(e) => patch({ country: e.target.value })}
              className="w-full rounded border border-fs-border bg-fs-bg px-2 py-1.5 text-xs text-fs-text focus:border-fs-accent/50 focus:outline-none focus:ring-1 focus:ring-fs-accent/25"
            >
              {MACRO_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}（{c.code}）
                </option>
              ))}
            </select>
          </label>

          <fieldset className="mb-3">
            <legend className="mb-1.5 text-[10px] font-medium text-fs-muted">重要性</legend>
            <div className="flex flex-wrap gap-1">
              {IMPORTANCE_OPTIONS.map(({ value, label }) => (
                <FilterChip
                  key={value}
                  label={label}
                  active={filters.importances.includes(value)}
                  onClick={() =>
                    patch({
                      importances: toggleFilterItem(filters.importances, value),
                    })
                  }
                />
              ))}
            </div>
            <p className="mt-1 text-[9px] text-fs-muted">不选表示全部</p>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-[10px] font-medium text-fs-muted">事件类型</legend>
            <div className="flex flex-wrap gap-1">
              {TIMELINE_FILTER_EVENT_TYPES.map((t) => (
                <FilterChip
                  key={t}
                  label={t}
                  active={filters.eventTypes.includes(t)}
                  onClick={() =>
                    patch({
                      eventTypes: toggleFilterItem(filters.eventTypes, t),
                    })
                  }
                />
              ))}
            </div>
            <p className="mt-1 text-[9px] text-fs-muted">不选表示全部</p>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
