"use client";

import { useEffect, useRef, useState } from "react";
import type { EventImportance } from "@prisma/client";
import { EVENT_IMPORTANCE_LABELS } from "@/lib/data/marketEvents";
import {
  ALL_EVENT_TYPE_FAMILY_IDS, EVENT_INDUSTRY_QUICK_SUGGESTIONS, EVENT_TYPE_FAMILIES,
  formatIndustryTagLabel, normalizeIndustryTag, type EventTypeFamilyId,
} from "@/lib/data/eventTaxonomy";
import { MACRO_COUNTRIES } from "@/lib/data/macroCatalog";
import { TagInput } from "@/components/events/TagInput";
import {
  DEFAULT_EVENT_VIEW_FILTERS, clearEventContentFilters, hasActiveEventViewContentFilters,
  isAllTypeFamiliesSelected, type EventViewFilterState,
} from "@/lib/chart/eventViewFilters";
import { COMPANY_KIND_FILTER_LABELS, COMPANY_KIND_FILTERS, type CompanyKindFilter } from "@/lib/equity/companyMilestones";

export type EventPanelFilterState = EventViewFilterState;
export const EMPTY_EVENT_PANEL_FILTERS = DEFAULT_EVENT_VIEW_FILTERS;
export { hasActiveEventViewContentFilters as hasActiveEventPanelFilters };

const control = "min-h-10 rounded border border-fs-border bg-fs-elevated px-2 py-1 text-xs text-fs-text sm:min-h-7";
const tagFields = [
  ["countries", "国家"], ["persons", "人物"], ["institutions", "机构"],
  ["industries", "行业"], ["assets", "资产"],
] as const;

type EventPanelFiltersProps = {
  filters: EventViewFilterState;
  onChange: (next: EventViewFilterState) => void;
  onResetToSymbolDefault?: () => void;
  companyKindFilter?: CompanyKindFilter[];
  onCompanyKindFilterChange?: (next: CompanyKindFilter[]) => void;
  layout?: "panel" | "shelf" | "inline";
  /** The shelf keeps its summary visible when the mobile filter sheet is closed. */
  showSummary?: boolean;
};

export function EventFilterSummary({ filters, onChange, compact = false }: Pick<EventPanelFiltersProps, "filters" | "onChange"> & { compact?: boolean }) {
  const patch = (p: Partial<EventViewFilterState>) => onChange({ ...filters, ...p });
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.searchQ.trim()) chips.push({ key: "search", label: `搜索：${filters.searchQ}`, remove: () => patch({ searchQ: "" }) });
  if (!isAllTypeFamiliesSelected(filters.typeFamilies)) chips.push({
    key: "types", label: `类型：${filters.typeFamilies.length ? EVENT_TYPE_FAMILIES.filter(f => filters.typeFamilies.includes(f.id)).map(f => f.label).join("、") : "未选（无结果）"}`,
    remove: () => patch({ typeFamilies: [...ALL_EVENT_TYPE_FAMILY_IDS], companyKinds: undefined }),
  });
  if (filters.typeFamilies.includes("company") && filters.companyKinds && filters.companyKinds.length < COMPANY_KIND_FILTERS.length) chips.push({
    key: "company", label: `公司细类：${filters.companyKinds.length ? filters.companyKinds.map(k => COMPANY_KIND_FILTER_LABELS[k as CompanyKindFilter]).join("、") : "未选"}`,
    remove: () => patch({ companyKinds: undefined }),
  });
  if (filters.minImportance !== "LOW") chips.push({ key: "importance", label: `重要度：${EVENT_IMPORTANCE_LABELS[filters.minImportance]}及以上`, remove: () => patch({ minImportance: "LOW" }) });
  if (filters.largeSurpriseOnly) chips.push({ key: "surprise", label: "仅宏观大预期差", remove: () => patch({ largeSurpriseOnly: false }) });
  for (const [key, label] of tagFields) for (const value of filters[key]) chips.push({
    key: `${key}:${value}`, label: `${label}：${key === "industries" ? formatIndustryTagLabel(value) : value}`,
    remove: () => patch({ [key]: filters[key].filter(v => v !== value) }),
  });
  return <div aria-label="生效内容条件" className={`flex items-center gap-1 text-xs text-fs-muted ${compact ? "min-h-7 overflow-x-auto whitespace-nowrap [&>button]:min-h-6 [&>button]:shrink-0 [&>button]:py-0" : "flex-wrap py-1"}`}>
    <span>{chips.length ? "已选条件" : "内容条件：不限"}</span>
    {chips.map(chip => <button key={chip.key} type="button" className={`${control} max-w-full bg-fs-accent-soft text-fs-accent-text break-words`} aria-label={`移除${chip.label}`} onClick={chip.remove}>{chip.label} ×</button>)}
    {chips.length > 0 && <button type="button" className={control} onClick={() => onChange(clearEventContentFilters(filters))}>清除内容条件</button>}
  </div>;
}

export function EventPanelFilters({ filters, onChange, onResetToSymbolDefault, companyKindFilter, onCompanyKindFilterChange, layout = "panel", showSummary = true }: EventPanelFiltersProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const typesPanel = useRef<HTMLDivElement>(null);
  const morePanel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (layout === "inline" && typesOpen) typesPanel.current?.showPopover(); }, [layout, typesOpen]);
  useEffect(() => { if (layout === "inline" && moreOpen) morePanel.current?.showPopover(); }, [layout, moreOpen]);
  const floating = layout === "inline";
  const panelClass = floating ? "fixed inset-0 m-auto max-h-[70dvh] w-[min(640px,calc(100vw-24px))] overflow-y-auto rounded border border-fs-border bg-fs-bg p-3 text-fs-text shadow-xl" : "space-y-2 rounded border border-fs-border p-2";
  const patch = (p: Partial<EventViewFilterState>) => onChange({ ...filters, ...p });
  const companyKinds = companyKindFilter ?? (filters.companyKinds
    ? filters.companyKinds.filter((k): k is CompanyKindFilter => COMPANY_KIND_FILTERS.includes(k as CompanyKindFilter))
    : [...COMPANY_KIND_FILTERS]);
  const advancedCount = tagFields.reduce((n, [key]) => n + filters[key].length, 0) + Number(filters.largeSurpriseOnly);
  const toggleFamily = (id: EventTypeFamilyId) => {
    const selected = new Set(filters.typeFamilies);
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    patch({ typeFamilies: ALL_EVENT_TYPE_FAMILY_IDS.filter(f => selected.has(f)),
      ...(id === "company" ? { companyKinds: selected.has("company") ? [...COMPANY_KIND_FILTERS] : [] } : {}) });
  };
  const setCompanyKinds = (next: CompanyKindFilter[]) => {
    if (onCompanyKindFilterChange) onCompanyKindFilterChange(next);
    else patch({ companyKinds: next });
  };
  return <div className={floating ? "contents" : "flex min-w-0 flex-col gap-1.5"}>
    <div className={floating ? "contents" : "flex flex-wrap items-center gap-2"}>
      <input type="search" value={filters.searchQ} onChange={e => patch({ searchQ: e.target.value })} placeholder="搜索标题或内容…" aria-label="搜索事件" className={`${control} ${floating ? "w-36 shrink-0" : "min-w-0 basis-full flex-1 sm:basis-auto sm:max-w-56"}`} />
      <button type="button" className={control} aria-expanded={typesOpen} onClick={() => setTypesOpen(!typesOpen)}>类型：{isAllTypeFamiliesSelected(filters.typeFamilies) ? "全部" : filters.typeFamilies.length ? `已选 ${filters.typeFamilies.length} 类` : "未选"} {typesOpen ? "▴" : "▾"}</button>
      <label className="flex items-center gap-1 text-xs text-fs-muted">重要度
        <select aria-label="最低重要度" value={filters.minImportance} onChange={e => patch({ minImportance: e.target.value as EventImportance })} className={control}>
          {(Object.keys(EVENT_IMPORTANCE_LABELS) as EventImportance[]).map(k => <option key={k} value={k}>{k === "LOW" ? "不限" : `${EVENT_IMPORTANCE_LABELS[k]}及以上`}</option>)}
        </select>
      </label>
      <button type="button" className={control} aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>更多筛选{advancedCount ? `（${advancedCount}）` : ""} {moreOpen ? "▴" : "▾"}</button>
      {onResetToSymbolDefault && <button type="button" className={control} onClick={onResetToSymbolDefault}>恢复资产默认</button>}
    </div>
    {typesOpen && <div ref={typesPanel} popover={floating ? "auto" : undefined} onToggle={e => { if (floating && !e.currentTarget.matches(":popover-open")) setTypesOpen(false); }} className={panelClass}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-fs-muted">类型（多选）</span>
        <button type="button" className={control} onClick={() => patch({ typeFamilies: [...ALL_EVENT_TYPE_FAMILY_IDS], companyKinds: undefined })}>全部类型</button>
        <button type="button" className={control} onClick={() => patch({ typeFamilies: [], companyKinds: [] })}>清空类型</button>
        {EVENT_TYPE_FAMILIES.map(f => <button key={f.id} type="button" aria-pressed={filters.typeFamilies.includes(f.id)} className={`${control} ${filters.typeFamilies.includes(f.id) ? "border-fs-accent bg-fs-accent-soft text-fs-accent-text" : ""}`} onClick={() => toggleFamily(f.id)}>{f.label}</button>)}
      </div>
      {!filters.typeFamilies.length && <p className="text-xs text-fs-muted">未选择任何类型，结果为空；选择一种类型或点击“全部类型”。</p>}
      {filters.typeFamilies.includes("company") && <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-fs-muted">公司细类</span>
        {COMPANY_KIND_FILTERS.map(k => <button key={k} type="button" aria-pressed={companyKinds.includes(k)} className={`${control} ${companyKinds.includes(k) ? "border-fs-accent bg-fs-accent-soft text-fs-accent-text" : ""}`} onClick={() => setCompanyKinds(companyKinds.includes(k) ? companyKinds.filter(v => v !== k) : [...companyKinds, k])}>{COMPANY_KIND_FILTER_LABELS[k]}</button>)}
      </div>}
    </div>}
    {moreOpen && <div ref={morePanel} popover={floating ? "auto" : undefined} onToggle={e => { if (floating && !e.currentTarget.matches(":popover-open")) setMoreOpen(false); }} className={panelClass}>
      <p className="text-xs text-fs-muted">同一条件多选满足任一项，不同条件需同时满足。标签用于收窄内容。</p>
      {(filters.typeFamilies.includes("macro") || filters.largeSurpriseOnly) && <fieldset className="rounded border border-fs-border p-2 text-xs">
        <legend>宏观专属条件</legend>
        <label className="flex min-h-10 items-center gap-2 sm:min-h-7"><input type="checkbox" checked={filters.largeSurpriseOnly} onChange={e => patch({ largeSurpriseOnly: e.target.checked })} />仅宏观大预期差</label>
        <p className="text-fs-muted">仅保留具有有效预期差证据的宏观发布，其他类型及缺少证据的事件会被排除；不表示利多或利空。</p>
      </fieldset>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <TagInput label="国家" values={filters.countries} onChange={countries => patch({ countries })} placeholder="US, CN…" suggestions={MACRO_COUNTRIES.map(c => c.code)} uppercase />
        <TagInput label="人物" values={filters.persons} onChange={persons => patch({ persons })} placeholder="Powell…" />
        <TagInput label="机构" values={filters.institutions} onChange={institutions => patch({ institutions })} placeholder="Fed、Goldman…" />
        <TagInput label="行业" values={filters.industries} onChange={industries => patch({ industries })} placeholder="信息技术、金融…" suggestions={EVENT_INDUSTRY_QUICK_SUGGESTIONS} formatLabel={formatIndustryTagLabel} normalizeAdd={normalizeIndustryTag} />
        <TagInput label="资产" values={filters.assets} onChange={assets => patch({ assets })} placeholder="AAPL、GC…" uppercase />
      </div>
    </div>}
    {showSummary && <EventFilterSummary filters={filters} onChange={onChange} />}
  </div>;
}
