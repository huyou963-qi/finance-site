import type { MarketEventDto } from "@/lib/data/marketEvents";
import { EVENT_IMPORTANCE_MIN_ORDER, eventTypeMatchesFamilies, normalizeEventType } from "@/lib/data/eventTaxonomy";
import { classifyMacroEventSurprise, expandEventAssetTags } from "@/lib/data/macroEventSurprise";
import { normalizeEventColor, readEventPresentation } from "@/lib/data/eventPresentation";
import { eventFiltersForSource, type EventViewFilterState } from "./eventViewFilters";

export type EventSourceGroup = "system" | "user";
export const EVENT_SOURCE_COLORS = { system: "#0369A1", user: "#7C3AED" } as const;
export function eventSourceGroup(e: Pick<MarketEventDto, "sourceKind">): EventSourceGroup { return e.sourceKind === "user_local" ? "user" : "system"; }

export function eventIdentity(e: Pick<MarketEventDto, "id" | "externalId"> & Partial<Pick<MarketEventDto, "sourceKind" | "localPackId">>): string { return e.sourceKind === "user_local" && e.localPackId ? e.id : e.externalId || e.id; }

function sourceKey(url: string | null) {
  if (!url) return "";
  try { const u = new URL(url); u.hash = ""; for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/.test(k)) u.searchParams.delete(k); return u.toString().replace(/\/$/, ""); } catch { return url; }
}

export function sameEvent(a: MarketEventDto, b: MarketEventDto): boolean {
  const differentUserPacks = a.sourceKind === "user_local" && b.sourceKind === "user_local" && a.localPackId !== b.localPackId;
  if ((a.id === b.id && eventSourceGroup(a) === eventSourceGroup(b)) ||
      (a.externalId && a.externalId === b.externalId && !differentUserPacks)) return true;
  if (a.occurredAt.slice(0, 10) !== b.occurredAt.slice(0, 10) || normalizeEventType(a.eventType) !== normalizeEventType(b.eventType)) return false;
  // Exact times and disjoint explicit subjects cannot be collapsed just because a document is shared.
  if (a.datePrecision === "DATETIME" && b.datePrecision === "DATETIME" && a.occurredAt !== b.occurredAt) return false;
  if (a.assets.length && b.assets.length && !a.assets.some(s => b.assets.includes(s))) return false;
  const ua = sourceKey(a.sourceUrl), ub = sourceKey(b.sourceUrl);
  const title = (e: MarketEventDto) => (e.title ?? "").replace(/\s+/g, "").toLowerCase();
  return Boolean((ua && ua === ub) || (title(a) && title(a) === title(b)));
}

function groupChartFacts(items: MarketEventDto[]): MarketEventDto[][] {
  const rank = (e: MarketEventDto) => e.sourceKind === "user_local" ? 0 : e.sourceKind === "sec" ? 2 : 1;
  const groups: MarketEventDto[][] = [];
  for (const event of [...items].sort((a, b) => rank(a) - rank(b))) {
    const group = groups.find(g => sameEvent(g[0], event));
    if (group) group.push(event); else groups.push([event]);
  }
  return groups.sort((a, b) => a[0].occurredAt.localeCompare(b[0].occurredAt) || a[0].id.localeCompare(b[0].id));
}

/** Personal annotations > shared facts > SEC projections. Never modifies the underlying sources. */
export function mergeChartEvents(local: MarketEventDto[], remote: MarketEventDto[], includeLocal = true): MarketEventDto[] {
  return groupChartFacts([...(includeLocal ? local : []), ...remote]).map(g => g[0]);
}

export function companyEventKind(e: MarketEventDto): string {
  const t = normalizeEventType(e.eventType) ?? "";
  if (e.sourceKind === "sec" || ["company.earnings", "company.filing", "company.corp_action"].includes(t)) return "sec";
  if (t === "company.product") return "product";
  if (t === "company.capacity") return "capacity";
  if (["company.mna", "company.capital", "company.partnership"].includes(t)) return "deal";
  return "other";
}

export const EVENT_EXCLUSION_LABELS = {
  range: "不在图表时间区间", era: "阶段背景不作为行情事件", source: "事件来源已关闭",
  surprise: "不满足宏观大预期差条件", type: "类型未选中", importance: "低于最低重要度",
  company: "公司细类未选中", search: "不匹配搜索内容", person: "人物不匹配", institution: "机构不匹配",
  country: "国家不匹配", industry: "行业不匹配", asset: "资产标签不匹配", hidden: "事件已隐藏",
} as const;
export type EventExclusionReason = keyof typeof EVENT_EXCLUSION_LABELS;

/** A single predicate supplies both filtering and explanation, in a stable priority order. */
export function eventContentExclusionReasons(e: MarketEventDto, state: EventViewFilterState): EventExclusionReason[] {
  const f = eventFiltersForSource(state, eventSourceGroup(e));
  const reasons: EventExclusionReason[] = [];
  if (e.eventType === "era" || e.eventType === "时代阶段") reasons.push("era");
  if ((f.includeLocal === false && e.sourceKind === "user_local") ||
      (!f.includeSec && e.sourceKind === "sec") ||
      (!f.includeMarket && e.sourceKind !== "sec" && e.sourceKind !== "user_local")) reasons.push("source");
  if (f.largeSurpriseOnly && (e.eventType !== "macro.release" || classifyMacroEventSurprise(e.payload).level !== "large")) reasons.push("surprise");
  if (!eventTypeMatchesFamilies(e.eventType, f.typeFamilies)) reasons.push("type");
  if (EVENT_IMPORTANCE_MIN_ORDER[e.importance] < EVENT_IMPORTANCE_MIN_ORDER[f.minImportance]) reasons.push("importance");
  if (f.companyKinds && f.companyKinds.length < 5 && (e.sourceKind === "sec" || (normalizeEventType(e.eventType) ?? "").startsWith("company.")) && !f.companyKinds.includes(companyEventKind(e))) reasons.push("company");
  const q = f.searchQ.trim().toLowerCase();
  const impact = (e.payload as { impact?: { summary?: string } } | null)?.impact?.summary ?? "";
  if (q && !`${e.title ?? ""} ${e.content} ${impact}`.toLowerCase().includes(q)) reasons.push("search");
  if (f.persons.length && !f.persons.some(p => e.persons.includes(p))) reasons.push("person");
  if (f.institutions.length && !f.institutions.some(p => e.institutions.includes(p))) reasons.push("institution");
  // System geographic/asset restrictions are resolved by the server before pagination.
  if (e.sourceKind === "user_local") {
    if (f.countries.length && !f.countries.some(c => e.countries.includes(c))) reasons.push("country");
    if (f.industries.length && !f.industries.some(c => e.industries.some(i => i.startsWith(c) || c.startsWith(i)))) reasons.push("industry");
    if (f.assets.length && !expandEventAssetTags(f.assets).some(a => expandEventAssetTags(e.assets).includes(a))) reasons.push("asset");
  }
  if (f.hiddenEventIds?.includes(eventIdentity(e))) reasons.push("hidden");
  return reasons;
}

export function eventPassesContentFilters(e: MarketEventDto, f: EventViewFilterState): boolean {
  return eventContentExclusionReasons(e, f).length === 0;
}

export function eventDisplayColor(e: MarketEventDto, f?: EventViewFilterState): string {
  if (f) f = eventFiltersForSource(f, eventSourceGroup(e));
  return normalizeEventColor(f?.eventColors?.[eventIdentity(e)]) || normalizeEventColor(f?.typeColors?.[e.eventType ?? "other"]) ||
    normalizeEventColor(e.color) || readEventPresentation(e.payload).color || EVENT_SOURCE_COLORS[eventSourceGroup(e)];
}

export function eventMarkerVisible(e: MarketEventDto, state: EventViewFilterState): boolean {
  const f = eventFiltersForSource(state, eventSourceGroup(e));
  return f.markersEnabled && !f.hiddenMarkerIds?.includes(eventIdentity(e));
}

export type EventChartProjection = {
  status: "candidate" | "merged" | "disabled" | "hidden_marker";
  representativeId: string | null;
  relatedIds: string[];
};

/** Source lists preserve records. Only marker-eligible records participate in chart deduplication. */
export function selectChartEvents(local: MarketEventDto[], remote: MarketEventDto[], state: EventViewFilterState, from: string, to: string) {
  const select = (items: MarketEventDto[]) => {
    const matched: MarketEventDto[] = [];
    const excluded: { event: MarketEventDto; reasons: EventExclusionReason[] }[] = [];
    const reasons: Partial<Record<EventExclusionReason, number>> = {};
    let inRange = 0;
    for (const event of items) {
      const within = event.occurredAt.slice(0, 10) >= from && event.occurredAt.slice(0, 10) <= to;
      if (within) inRange++;
      const failed: EventExclusionReason[] = [...(within ? [] : ["range" as const]), ...eventContentExclusionReasons(event, state)];
      if (failed.length) {
        excluded.push({ event, reasons: failed });
        reasons[failed[0]] = (reasons[failed[0]] ?? 0) + 1;
      } else matched.push({ ...event, color: eventDisplayColor(event, state) });
    }
    return { matched, excluded, stats: { loaded: items.length, inRange, matched: matched.length,
      outsideRange: items.length - inRange, filteredOut: inRange - matched.length, reasons,
      chartCandidates: 0, merged: 0, markerDisabled: 0, markerHidden: 0 } };
  };
  const system = select(remote), user = select(local);
  const events = [...system.matched, ...user.matched].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  const chartProjection: Record<string, EventChartProjection> = {};
  const eligible = events.filter(e => {
    const f = eventFiltersForSource(state, eventSourceGroup(e));
    const stats = eventSourceGroup(e) === "system" ? system.stats : user.stats;
    if (!f.markersEnabled) { chartProjection[e.id] = { status: "disabled", representativeId: null, relatedIds: [] }; stats.markerDisabled++; return false; }
    if (f.hiddenMarkerIds?.includes(eventIdentity(e))) { chartProjection[e.id] = { status: "hidden_marker", representativeId: null, relatedIds: [] }; stats.markerHidden++; return false; }
    return true;
  });
  const groups = groupChartFacts(eligible);
  for (const group of groups) for (const event of group) {
    const primary = event.id === group[0].id;
    chartProjection[event.id] = { status: primary ? "candidate" : "merged", representativeId: group[0].id, relatedIds: group.map(e => e.id) };
    const stats = eventSourceGroup(event) === "system" ? system.stats : user.stats;
    if (primary) stats.chartCandidates++; else stats.merged++;
  }
  return { events, chartEvents: groups.map(g => g[0]), chartProjection,
    sourceEvents: { system: system.matched, user: user.matched },
    excludedEvents: { system: system.excluded, user: user.excluded },
    sourceStats: { system: system.stats, user: user.stats }, loaded: local.length + remote.length,
    inRange: system.stats.inRange + user.stats.inRange, filteredOut: system.stats.filteredOut + user.stats.filteredOut };
}
