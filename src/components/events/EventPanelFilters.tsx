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
  type EventViewFilterState,
} from "@/lib/chart/eventViewFilters";
import {
  COMPANY_KIND_FILTER_LABELS,
  COMPANY_KIND_FILTERS,
  type CompanyKindFilter,
} from "@/lib/equity/companyMilestones";

export type EventPanelFilterState = EventViewFilterState;
export const EMPTY_EVENT_PANEL_FILTERS = DEFAULT_EVENT_VIEW_FILTERS;
export { hasActiveEventViewContentFilters as hasActiveEventPanelFilters };

type EventPanelFiltersProps = {
  filters: EventViewFilterState;
  onChange: (next: EventViewFilterState) => void;
  onResetToSymbolDefault?: () => void;
  companyKindFilter?: CompanyKindFilter[];
  onCompanyKindFilterChange?: (next: CompanyKindFilter[]) => void;
  /** shelf：搜索与类型/公司/重要度同一行；panel：纵向（默认） */
  layout?: "panel" | "shelf";
};

export function EventPanelFilters({
  filters,
  onChange,
  onResetToSymbolDefault,
  companyKindFilter,
  onCompanyKindFilterChange,
  layout = "panel",
}: EventPanelFiltersProps) {
  const patch = (p: Partial<EventViewFilterState>) =>
    onChange({ ...filters, ...p });

  const companyFamilyOn = filters.typeFamilies.includes("company");
  const shelf = layout === "shelf";
  const [moreOpen, setMoreOpen] = useState(!shelf);

  const toggleFamily = (id: EventTypeFamilyId) => {
    const set = new Set(filters.typeFamilies);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = ALL_EVENT_TYPE_FAMILY_IDS.filter((f) => set.has(f));
    patch({ typeFamilies: next });
    if (id === "company") {
      onCompanyKindFilterChange?.(
        set.has("company") ? [...COMPANY_KIND_FILTERS] : [],
      );
    }
  };

  const toggleCompanyKind = (k: CompanyKindFilter) => {
    if (!onCompanyKindFilterChange) return;
    const cur = companyKindFilter ?? [];
    if (cur.includes(k)) {
      onCompanyKindFilterChange(cur.filter((x) => x !== k));
    } else {
      onCompanyKindFilterChange([...cur, k]);
    }
  };

  const advancedActive =
    filters.countries.length > 0 ||
    filters.industries.length > 0 ||
    filters.assets.length > 0 ||
    filters.persons.length > 0 ||
    filters.institutions.length > 0;

  const typeChips = (
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
    </div>
  );

  const companyChips =
    companyFamilyOn && onCompanyKindFilterChange ? (
      <div className={`flex flex-wrap items-center gap-1 ${shelf ? "" : "pl-1"}`}>
        <span className="text-[10px] text-fs-muted">公司</span>
        {COMPANY_KIND_FILTERS.map((k) => {
          const on = (companyKindFilter ?? []).includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleCompanyKind(k)}
              aria-pressed={on}
              className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
                on
                  ? "border-fs-accent/40 bg-fs-accent-soft text-fs-accent-text"
                  : "border-fs-border text-fs-muted hover:text-fs-text"
              }`}
            >
              {COMPANY_KIND_FILTER_LABELS[k]}
            </button>
          );
        })}
      </div>
    ) : null;

  const importanceAndMore = (
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
  );

  const morePanel = moreOpen ? (
    <div
      className={`rounded border border-fs-border bg-fs-bg/40 p-1.5 ${
        shelf
          ? "grid grid-cols-5 gap-1.5"
          : "grid grid-cols-2 gap-1.5 sm:grid-cols-5"
      }`}
    >
      <div className="min-w-0">
        <TagInput
          label="国家"
          values={filters.countries}
          onChange={(countries) => patch({ countries })}
          placeholder="US, CN…"
          suggestions={MACRO_COUNTRIES.map((c) => c.code)}
          uppercase
        />
      </div>
      <div className="min-w-0">
        <TagInput
          label="人物"
          values={filters.persons}
          onChange={(persons) => patch({ persons })}
          placeholder="Powell…"
        />
      </div>
      <div className="min-w-0">
        <TagInput
          label="机构"
          values={filters.institutions}
          onChange={(institutions) => patch({ institutions })}
          placeholder="Fed、Goldman…"
        />
      </div>
      <div className="min-w-0">
        <TagInput
          label="行业"
          values={filters.industries}
          onChange={(industries) => patch({ industries })}
          placeholder="信息技术、金融…"
          suggestions={EVENT_INDUSTRY_QUICK_SUGGESTIONS}
          formatLabel={formatIndustryTagLabel}
          normalizeAdd={normalizeIndustryTag}
        />
      </div>
      <div className="min-w-0">
        <TagInput
          label="资产"
          values={filters.assets}
          onChange={(assets) => patch({ assets })}
          placeholder="AAPL、GC…"
          uppercase
        />
      </div>
    </div>
  ) : null;

  if (shelf) {
    return (
      <div className="flex shrink-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <input
            type="search"
            value={filters.searchQ}
            onChange={(e) => patch({ searchQ: e.target.value })}
            placeholder="搜索…"
            className="w-28 shrink-0 rounded border border-fs-border bg-fs-elevated px-2 py-0.5 text-[11px] text-fs-text placeholder:text-fs-secondary focus:border-fs-accent/50 focus:outline-none focus:ring-1 focus:ring-fs-accent/30"
            aria-label="搜索事件"
          />
          {typeChips}
          {companyChips}
          {importanceAndMore}
        </div>
        {morePanel}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <input
        type="search"
        value={filters.searchQ}
        onChange={(e) => patch({ searchQ: e.target.value })}
        placeholder="搜索标题或内容…"
        className="w-full rounded border border-fs-border bg-fs-elevated px-2 py-1 text-[11px] text-fs-text placeholder:text-fs-secondary focus:border-fs-accent/50 focus:outline-none focus:ring-1 focus:ring-fs-accent/30"
        aria-label="搜索事件"
      />
      {typeChips}
      {companyChips}
      {importanceAndMore}
      {morePanel}
    </div>
  );
}
