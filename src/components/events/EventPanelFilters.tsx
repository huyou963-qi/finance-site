"use client";

import { useState } from "react";
import type { EventImportance } from "@prisma/client";
import { EVENT_IMPORTANCE_LABELS } from "@/lib/data/marketEvents";
import {
  ALL_EVENT_TYPE_FAMILY_IDS,
  EVENT_INDUSTRY_QUICK_SUGGESTIONS,
  EVENT_TYPE_FAMILIES,
  formatIndustryTagLabel,
  normalizeIndustryTag,
  type EventTypeFamilyId,
} from "@/lib/data/eventTaxonomy";
import { MACRO_COUNTRIES } from "@/lib/data/macroCatalog";
import { TagInput } from "@/components/events/TagInput";
import {
  DEFAULT_EVENT_VIEW_FILTERS,
  hasActiveEventViewContentFilters,
  isAllTypeFamiliesSelected,
  type EventViewFilterState,
} from "@/lib/chart/eventViewFilters";
import type { EventScopeMode } from "@/lib/data/assetEventResolver";
import type { ChartSymbolProfile } from "@/lib/data/chartSymbolProfile";

export type EventPanelFilterState = EventViewFilterState;
export const EMPTY_EVENT_PANEL_FILTERS = DEFAULT_EVENT_VIEW_FILTERS;
export { hasActiveEventViewContentFilters as hasActiveEventPanelFilters };

type EventPanelFiltersProps = {
  filters: EventViewFilterState;
  onChange: (next: EventViewFilterState) => void;
  /** 行情 docked：展示范围 + 显示开关 + 上下文徽章 */
  chartLinked?: boolean;
  /** 当前标的画像（徽章） */
  symbolProfile?: ChartSymbolProfile | null;
  onResetToSymbolDefault?: () => void;
};

const SCOPE_MODE_LABELS: Record<EventScopeMode, string> = {
  follow: "跟随标的",
  range: "时间轴全部",
};

export function EventPanelFilters({
  filters,
  onChange,
  chartLinked = false,
  symbolProfile = null,
  onResetToSymbolDefault,
}: EventPanelFiltersProps) {
  const patch = (p: Partial<EventViewFilterState>) =>
    onChange({ ...filters, ...p });

  const allFamilies = isAllTypeFamiliesSelected(filters.typeFamilies);
  const [moreOpen, setMoreOpen] = useState(true);

  const toggleFamily = (id: EventTypeFamilyId) => {
    const set = new Set(filters.typeFamilies);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = ALL_EVENT_TYPE_FAMILY_IDS.filter((f) => set.has(f));
    patch({
      typeFamilies: next.length ? next : [...ALL_EVENT_TYPE_FAMILY_IDS],
    });
  };

  const selectAllFamilies = () =>
    patch({ typeFamilies: [...ALL_EVENT_TYPE_FAMILY_IDS] });

  const advancedActive =
    filters.countries.length > 0 ||
    filters.industries.length > 0 ||
    filters.assets.length > 0 ||
    filters.persons.length > 0 ||
    filters.institutions.length > 0;

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      {chartLinked && symbolProfile ? (
        <p className="truncate text-[10px] text-fs-muted">
          上下文：
          <span className="text-fs-text">{symbolProfile.symbol}</span>
          {" · "}
          {symbolProfile.kindLabel}
          {" · "}
          <span className="text-fs-secondary">自动跟随（换标的会重算）</span>
        </p>
      ) : null}

      {chartLinked ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-fs-border/80 bg-fs-elevated/40 px-1.5 py-1 text-[10px]">
          <span className="font-medium text-fs-secondary">显示</span>
          <label className="inline-flex cursor-pointer items-center gap-1 text-fs-muted">
            <input
              type="checkbox"
              checked={filters.markersEnabled}
              onChange={(e) => patch({ markersEnabled: e.target.checked })}
              className="accent-[var(--fs-accent,#2383e2)]"
            />
            图上标记
          </label>
          {filters.markersEnabled ? (
            <>
              <label className="inline-flex cursor-pointer items-center gap-1 text-fs-muted">
                <input
                  type="checkbox"
                  checked={filters.includeSec}
                  onChange={(e) => patch({ includeSec: e.target.checked })}
                  className="accent-[var(--fs-accent,#2383e2)]"
                />
                SEC公司
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1 text-fs-muted">
                <input
                  type="checkbox"
                  checked={filters.includeMarket}
                  onChange={(e) => patch({ includeMarket: e.target.checked })}
                  className="accent-[var(--fs-accent,#2383e2)]"
                />
                其它事件
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1 text-fs-muted">
                <input
                  type="checkbox"
                  checked={filters.showLabel}
                  onChange={(e) => patch({ showLabel: e.target.checked })}
                  className="accent-[var(--fs-accent,#2383e2)]"
                />
                文字
              </label>
            </>
          ) : null}
        </div>
      ) : null}

      <input
        type="search"
        value={filters.searchQ}
        onChange={(e) => patch({ searchQ: e.target.value })}
        placeholder="搜索标题或内容…"
        className="w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-[11px] text-fs-text placeholder:text-fs-secondary focus:border-fs-accent/50 focus:outline-none focus:ring-1 focus:ring-fs-accent/30"
        aria-label="搜索事件"
      />

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-fs-muted">类型</span>
        {EVENT_TYPE_FAMILIES.map((f) => {
          const on = filters.typeFamilies.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggleFamily(f.id)}
              aria-pressed={on}
              className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
                on
                  ? "border-fs-accent/40 bg-fs-accent-soft text-fs-accent-text"
                  : "border-fs-border text-fs-muted hover:border-fs-border hover:text-fs-text"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        {!allFamilies ? (
          <button
            type="button"
            onClick={selectAllFamilies}
            className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-muted hover:text-fs-text"
          >
            全选
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[10px] text-fs-muted">
          最低重要度
          <select
            value={filters.minImportance}
            onChange={(e) =>
              patch({ minImportance: e.target.value as EventImportance })
            }
            className="rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[10px] text-fs-text"
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
        {chartLinked ? (
          <label className="flex items-center gap-1 text-[10px] text-fs-muted">
            范围
            <select
              value={filters.scopeMode}
              onChange={(e) =>
                patch({ scopeMode: e.target.value as EventScopeMode })
              }
              className="rounded border border-fs-border bg-fs-elevated px-1.5 py-0.5 text-[10px] text-fs-text"
              title="跟随标的：按国家/行业/资产标签匹配；时间轴全部：仅按可见时间窗"
            >
              {(Object.keys(SCOPE_MODE_LABELS) as EventScopeMode[]).map((k) => (
                <option key={k} value={k}>
                  {SCOPE_MODE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
            moreOpen || advancedActive
              ? "border-fs-accent/40 bg-fs-accent-soft text-fs-accent-text"
              : "border-fs-border text-fs-muted hover:text-fs-text"
          }`}
        >
          更多条件 {moreOpen ? "▴" : "▾"}
        </button>
        {onResetToSymbolDefault ? (
          <button
            type="button"
            onClick={onResetToSymbolDefault}
            className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-muted hover:text-fs-text"
          >
            重置为标的默认
          </button>
        ) : hasActiveEventViewContentFilters(filters) ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...filters,
                searchQ: "",
                typeFamilies: [...DEFAULT_EVENT_VIEW_FILTERS.typeFamilies],
                minImportance: DEFAULT_EVENT_VIEW_FILTERS.minImportance,
                countries: [],
                industries: [],
                assets: [],
                persons: [],
                institutions: [],
              })
            }
            className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-muted hover:text-fs-text"
          >
            重置
          </button>
        ) : null}
      </div>

      {moreOpen ? (
        <div className="space-y-1.5 rounded border border-fs-border bg-fs-bg/40 p-1.5">
          <TagInput
            label="国家"
            values={filters.countries}
            onChange={(countries) => patch({ countries })}
            placeholder="US, CN…"
            suggestions={MACRO_COUNTRIES.map((c) => c.code)}
            uppercase
          />
          <TagInput
            label="行业（GICS）"
            values={filters.industries}
            onChange={(industries) => patch({ industries })}
            placeholder="信息技术、金融…"
            suggestions={EVENT_INDUSTRY_QUICK_SUGGESTIONS}
            formatLabel={formatIndustryTagLabel}
            normalizeAdd={normalizeIndustryTag}
          />
          <TagInput
            label="资产"
            values={filters.assets}
            onChange={(assets) => patch({ assets })}
            placeholder="AAPL、GC…"
            uppercase
          />
          <TagInput
            label="人物"
            values={filters.persons}
            onChange={(persons) => patch({ persons })}
            placeholder="Powell…"
          />
          <TagInput
            label="机构"
            values={filters.institutions}
            onChange={(institutions) => patch({ institutions })}
            placeholder="Fed、Goldman…"
          />
        </div>
      ) : null}
    </div>
  );
}
