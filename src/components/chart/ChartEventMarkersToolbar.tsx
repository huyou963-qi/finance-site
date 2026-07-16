"use client";

import type { ChartEventMarkerPrefs } from "@/lib/chart/chartEventMarkerPrefs";
import type { EventImportance } from "@prisma/client";
import { EVENT_IMPORTANCE_LABELS } from "@/lib/data/marketEvents";

type Props = {
  prefs: ChartEventMarkerPrefs;
  onChange: (next: ChartEventMarkerPrefs) => void;
  compact?: boolean;
};

export function ChartEventMarkersToolbar({ prefs, onChange, compact }: Props) {
  const patch = (p: Partial<ChartEventMarkerPrefs>) => onChange({ ...prefs, ...p });

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 text-[10px] ${
        compact ? "" : "rounded border border-fs-border bg-fs-bg/60 px-1.5 py-1"
      }`}
    >
      <label className="inline-flex cursor-pointer items-center gap-1 text-fs-muted">
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="accent-cyan-600"
        />
        事件标记
      </label>
      {prefs.enabled ? (
        <>
          <label className="inline-flex cursor-pointer items-center gap-1 text-fs-muted">
            <input
              type="checkbox"
              checked={prefs.includeSec}
              onChange={(e) => patch({ includeSec: e.target.checked })}
              className="accent-cyan-600"
            />
            SEC公司
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1 text-fs-muted">
            <input
              type="checkbox"
              checked={prefs.includeMarket}
              onChange={(e) => patch({ includeMarket: e.target.checked })}
              className="accent-cyan-600"
            />
            其它事件
          </label>
          <label className="inline-flex items-center gap-0.5 text-fs-muted">
            最低
            <select
              value={prefs.minImportance}
              onChange={(e) =>
                patch({ minImportance: e.target.value as EventImportance })
              }
              className="rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            >
              {(Object.keys(EVENT_IMPORTANCE_LABELS) as EventImportance[]).map((k) => (
                <option key={k} value={k}>
                  {EVENT_IMPORTANCE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-0.5 text-fs-muted">
            上卷
            <select
              value={prefs.expand}
              onChange={(e) =>
                patch({
                  expand: e.target.value as ChartEventMarkerPrefs["expand"],
                })
              }
              className="rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
            >
              <option value="symbol">仅本票</option>
              <option value="industry">+行业</option>
              <option value="country">+国家</option>
            </select>
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1 text-fs-muted">
            <input
              type="checkbox"
              checked={prefs.showLabel}
              onChange={(e) => patch({ showLabel: e.target.checked })}
              className="accent-cyan-600"
            />
            显示文字
          </label>
        </>
      ) : null}
    </div>
  );
}
