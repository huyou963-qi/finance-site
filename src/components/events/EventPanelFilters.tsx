"use client";

import type { EventImportance } from "@/lib/data/marketEvents";
import {
  EVENT_IMPORTANCE_LABELS,
  EVENT_TYPE_SUGGESTIONS,
  EVENT_INDUSTRY_SUGGESTIONS,
} from "@/lib/data/marketEvents";
import { MACRO_COUNTRIES } from "@/lib/data/macroCatalog";
import { TagInput } from "@/components/events/TagInput";

export type EventPanelFilterState = {
  searchQ: string;
  countries: string[];
  industries: string[];
  assets: string[];
  importance: EventImportance | "";
  eventType: string;
};

export const EMPTY_EVENT_PANEL_FILTERS: EventPanelFilterState = {
  searchQ: "",
  countries: [],
  industries: [],
  assets: [],
  importance: "",
  eventType: "",
};

export function hasActiveEventPanelFilters(f: EventPanelFilterState): boolean {
  return Boolean(
    f.searchQ.trim() ||
      f.countries.length ||
      f.industries.length ||
      f.assets.length ||
      f.importance ||
      f.eventType,
  );
}

type FilterTagChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

export function eventPanelFilterTagChips(
  filters: EventPanelFilterState,
  onChange: (next: EventPanelFilterState) => void,
): FilterTagChip[] {
  const chips: FilterTagChip[] = [];
  if (filters.importance) {
    chips.push({
      id: "importance",
      label: EVENT_IMPORTANCE_LABELS[filters.importance],
      onRemove: () => onChange({ ...filters, importance: "" }),
    });
  }
  if (filters.eventType) {
    chips.push({
      id: `type-${filters.eventType}`,
      label: filters.eventType,
      onRemove: () => onChange({ ...filters, eventType: "" }),
    });
  }
  for (const c of filters.countries) {
    chips.push({
      id: `country-${c}`,
      label: c,
      onRemove: () =>
        onChange({ ...filters, countries: filters.countries.filter((x) => x !== c) }),
    });
  }
  for (const ind of filters.industries) {
    chips.push({
      id: `ind-${ind}`,
      label: ind,
      onRemove: () =>
        onChange({ ...filters, industries: filters.industries.filter((x) => x !== ind) }),
    });
  }
  for (const a of filters.assets) {
    chips.push({
      id: `asset-${a}`,
      label: a,
      onRemove: () => onChange({ ...filters, assets: filters.assets.filter((x) => x !== a) }),
    });
  }
  return chips;
}

type EventPanelFiltersProps = {
  filters: EventPanelFilterState;
  onChange: (next: EventPanelFilterState) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
};

export function EventPanelFilters({
  filters,
  onChange,
  expanded,
  onToggleExpanded,
}: EventPanelFiltersProps) {
  const patch = (p: Partial<EventPanelFilterState>) => onChange({ ...filters, ...p });
  const tagChips = eventPanelFilterTagChips(filters, onChange);

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <input
        type="search"
        value={filters.searchQ}
        onChange={(e) => patch({ searchQ: e.target.value })}
        placeholder="搜索标题或内容…"
        className="w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-[11px] text-fs-text placeholder:text-fs-secondary focus:border-cyan-700 focus:outline-none focus:ring-1 focus:ring-cyan-700/40"
        aria-label="搜索事件"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={onToggleExpanded}
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] transition ${
            expanded || hasActiveEventPanelFilters(filters)
              ? "border-cyan-800/60 bg-cyan-950/30 text-cyan-200"
              : "border-fs-border text-fs-muted hover:border-fs-border hover:text-fs-text"
          }`}
        >
          标签筛选
        </button>
        {tagChips.map((chip) => (
          <span
            key={chip.id}
            className="inline-flex max-w-full items-center gap-0.5 rounded border border-fs-border bg-fs-elevated px-1 py-0 text-[10px] text-fs-text"
          >
            <span className="truncate">{chip.label}</span>
            <button
              type="button"
              className="shrink-0 text-fs-muted hover:text-rose-300"
              onClick={chip.onRemove}
              aria-label={`移除 ${chip.label}`}
            >
              ×
            </button>
          </span>
        ))}
        {hasActiveEventPanelFilters(filters) ? (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_EVENT_PANEL_FILTERS })}
            className="shrink-0 rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-muted hover:text-fs-text"
          >
            清除
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="space-y-1.5 rounded border border-fs-border bg-fs-bg/40 p-1.5">
          <div className="flex flex-wrap gap-1">
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[10px] text-fs-muted">
              重要性
              <select
                value={filters.importance}
                onChange={(e) =>
                  patch({ importance: e.target.value as EventImportance | "" })
                }
                className="rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
              >
                <option value="">全部</option>
                {(Object.keys(EVENT_IMPORTANCE_LABELS) as EventImportance[]).map((k) => (
                  <option key={k} value={k}>
                    {EVENT_IMPORTANCE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[10px] text-fs-muted">
              类型
              <select
                value={filters.eventType}
                onChange={(e) => patch({ eventType: e.target.value })}
                className="rounded border border-fs-border bg-fs-elevated px-1 py-0.5 text-[10px] text-fs-text"
              >
                <option value="">全部</option>
                {EVENT_TYPE_SUGGESTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <TagInput
            label="国家"
            values={filters.countries}
            onChange={(countries) => patch({ countries })}
            placeholder="US, CN…"
            suggestions={MACRO_COUNTRIES.map((c) => c.code)}
            uppercase
          />
          <TagInput
            label="行业"
            values={filters.industries}
            onChange={(industries) => patch({ industries })}
            placeholder="金融、能源…"
            suggestions={EVENT_INDUSTRY_SUGGESTIONS}
          />
          <TagInput
            label="资产"
            values={filters.assets}
            onChange={(assets) => patch({ assets })}
            placeholder="AAPL、GC…"
            uppercase
          />
        </div>
      ) : null}
    </div>
  );
}
