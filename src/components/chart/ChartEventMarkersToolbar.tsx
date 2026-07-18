"use client";

import type { ChartEventMarkerPrefs } from "@/lib/chart/chartEventMarkerPrefs";
import type { EventImportance } from "@prisma/client";
import { EVENT_IMPORTANCE_LABELS } from "@/lib/data/marketEvents";

type Props = {
  prefs: ChartEventMarkerPrefs;
  onChange: (next: ChartEventMarkerPrefs) => void;
  /** inline：顶栏横排；panel：侧栏竖排分组 */
  layout?: "inline" | "panel";
};

export function ChartEventMarkersToolbar({
  prefs,
  onChange,
  layout = "inline",
}: Props) {
  const patch = (p: Partial<ChartEventMarkerPrefs>) => onChange({ ...prefs, ...p });
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
          checked={prefs.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="accent-[var(--fs-accent,#2383e2)]"
        />
        事件标记
      </label>
      {prefs.enabled ? (
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
          <label
            className={
              isPanel
                ? "flex items-center justify-between gap-2 text-fs-muted"
                : "inline-flex items-center gap-0.5 text-fs-muted"
            }
          >
            <span>最低重要度</span>
            <select
              value={prefs.minImportance}
              onChange={(e) =>
                patch({ minImportance: e.target.value as EventImportance })
              }
              className="rounded border border-fs-border bg-fs-bg px-1.5 py-0.5 text-[10px] text-fs-text"
            >
              {(Object.keys(EVENT_IMPORTANCE_LABELS) as EventImportance[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {EVENT_IMPORTANCE_LABELS[k]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label
            className={
              isPanel
                ? "flex items-center justify-between gap-2 text-fs-muted"
                : "inline-flex items-center gap-0.5 text-fs-muted"
            }
          >
            <span>上卷范围</span>
            <select
              value={prefs.expand}
              onChange={(e) =>
                patch({
                  expand: e.target.value as ChartEventMarkerPrefs["expand"],
                })
              }
              className="rounded border border-fs-border bg-fs-bg px-1.5 py-0.5 text-[10px] text-fs-text"
            >
              <option value="symbol">仅本票</option>
              <option value="industry">+行业</option>
              <option value="country">+国家</option>
            </select>
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
