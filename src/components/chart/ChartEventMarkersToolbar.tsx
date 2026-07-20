"use client";

import type { EventViewFilterState } from "@/lib/chart/eventViewFilters";

type Props = {
  prefs: EventViewFilterState;
  onChange: (next: EventViewFilterState) => void;
  layout?: "inline" | "panel";
};

/** 未受控时顶栏用的精简「图上标记」开关（侧栏已合一后很少用） */
export function ChartEventMarkersToolbar({
  prefs,
  onChange,
  layout = "inline",
}: Props) {
  const patch = (p: Partial<EventViewFilterState>) =>
    onChange({ ...prefs, ...p });
  const isPanel = layout === "panel";

  return (
    <div
      className={
        isPanel
          ? "flex flex-col gap-2 rounded-md border border-fs-border bg-fs-elevated/60 px-2 py-2 text-[11px]"
          : "flex flex-wrap items-center gap-1.5 text-[10px]"
      }
    >
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-fs-muted">
        <input
          type="checkbox"
          checked={prefs.markersEnabled}
          onChange={(e) => patch({ markersEnabled: e.target.checked })}
          className="accent-[var(--fs-accent,#2383e2)]"
        />
        图上标记
      </label>
      {prefs.markersEnabled ? (
        <div
          className={
            isPanel
              ? "flex flex-col gap-2 border-t border-fs-border/80 pt-2"
              : "contents"
          }
        >
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-fs-muted">
            <input
              type="checkbox"
              checked={prefs.includeSec}
              onChange={(e) => patch({ includeSec: e.target.checked })}
              className="accent-[var(--fs-accent,#2383e2)]"
            />
            SEC公司
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-fs-muted">
            <input
              type="checkbox"
              checked={prefs.includeMarket}
              onChange={(e) => patch({ includeMarket: e.target.checked })}
              className="accent-[var(--fs-accent,#2383e2)]"
            />
            其它事件
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-fs-muted">
            <input
              type="checkbox"
              checked={prefs.showLabel}
              onChange={(e) => patch({ showLabel: e.target.checked })}
              className="accent-[var(--fs-accent,#2383e2)]"
            />
            显示文字
          </label>
        </div>
      ) : null}
    </div>
  );
}
