import type { MarketEventDto } from "@/lib/data/marketEvents";
import { EVENT_IMPORTANCE_MIN_ORDER, eventTypeMatchesFamilies, normalizeEventType } from "@/lib/data/eventTaxonomy";
import { classifyMacroEventSurprise } from "@/lib/data/macroEventSurprise";
import { normalizeEventColor, readEventPresentation } from "@/lib/data/eventPresentation";
import type { EventViewFilterState } from "./eventViewFilters";

export type EventSourceGroup = "system" | "user";
export const EVENT_SOURCE_COLORS = { system: "#0369A1", user: "#7C3AED" } as const;
export function eventSourceGroup(e: Pick<MarketEventDto, "sourceKind">): EventSourceGroup { return e.sourceKind === "user_local" ? "user" : "system"; }

export function eventIdentity(e: Pick<MarketEventDto, "id" | "externalId">): string { return e.externalId || e.id; }

function sourceKey(url: string | null) {
  if (!url) return "";
  try { const u = new URL(url); u.hash = ""; for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/.test(k)) u.searchParams.delete(k); return u.toString().replace(/\/$/, ""); } catch { return url; }
}

export function sameEvent(a: MarketEventDto, b: MarketEventDto): boolean {
  if (a.id === b.id || (a.externalId && a.externalId === b.externalId)) return true;
  if (a.occurredAt.slice(0, 10) !== b.occurredAt.slice(0, 10) || normalizeEventType(a.eventType) !== normalizeEventType(b.eventType)) return false;
  // Exact times and disjoint explicit subjects cannot be collapsed just because a document is shared.
  if (a.datePrecision === "DATETIME" && b.datePrecision === "DATETIME" && a.occurredAt !== b.occurredAt) return false;
  if (a.assets.length && b.assets.length && !a.assets.some(s => b.assets.includes(s))) return false;
  const ua = sourceKey(a.sourceUrl), ub = sourceKey(b.sourceUrl);
  const title = (e: MarketEventDto) => (e.title ?? "").replace(/\s+/g, "").toLowerCase();
  return Boolean((ua && ua === ub) || (title(a) && title(a) === title(b)));
}

/** Personal annotations > shared facts > SEC projections. Never modifies the underlying sources. */
export function mergeChartEvents(local: MarketEventDto[], remote: MarketEventDto[], includeLocal = true): MarketEventDto[] {
  const rank = (e: MarketEventDto) => e.sourceKind === "user_local" ? 0 : e.sourceKind === "sec" ? 2 : 1;
  const out: MarketEventDto[] = [];
  for (const e of [...(includeLocal ? local : []), ...remote].sort((a, b) => rank(a) - rank(b))) if (!out.some(prev => sameEvent(prev, e))) out.push(e);
  return out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}

export function companyEventKind(e: MarketEventDto): string {
  const t = normalizeEventType(e.eventType) ?? "";
  if (e.sourceKind === "sec" || ["company.earnings", "company.filing", "company.corp_action"].includes(t)) return "sec";
  if (t === "company.product") return "product";
  if (t === "company.capacity") return "capacity";
  if (["company.mna", "company.capital", "company.partnership"].includes(t)) return "deal";
  return "other";
}

export function eventPassesContentFilters(e: MarketEventDto, f: EventViewFilterState): boolean {
  if (e.eventType === "era" || e.eventType === "时代阶段") return false;
  if (f.includeLocal === false && e.sourceKind === "user_local") return false;
  if (!f.includeSec && e.sourceKind === "sec") return false;
  if (!f.includeMarket && e.sourceKind !== "sec" && e.sourceKind !== "user_local") return false;
  if (f.largeSurpriseOnly && (e.eventType !== "macro.release" || classifyMacroEventSurprise(e.payload).level !== "large")) return false;
  if (!eventTypeMatchesFamilies(e.eventType, f.typeFamilies) || EVENT_IMPORTANCE_MIN_ORDER[e.importance] < EVENT_IMPORTANCE_MIN_ORDER[f.minImportance]) return false;
  if (f.companyKinds && f.companyKinds.length < 5 && (e.sourceKind === "sec" || (normalizeEventType(e.eventType) ?? "").startsWith("company.")) && !f.companyKinds.includes(companyEventKind(e))) return false;
  const q = f.searchQ.trim().toLowerCase();
  const impact = (e.payload as { impact?: { summary?: string } } | null)?.impact?.summary ?? "";
  if (q && !`${e.title ?? ""} ${e.content} ${impact}`.toLowerCase().includes(q)) return false;
  if (f.persons.length && !f.persons.some(p => e.persons.includes(p))) return false;
  if (f.institutions.length && !f.institutions.some(p => e.institutions.includes(p))) return false;
  if (f.hiddenEventIds?.includes(eventIdentity(e))) return false;
  return true;
}

export function eventDisplayColor(e: MarketEventDto, f?: EventViewFilterState): string {
  return normalizeEventColor(f?.eventColors?.[eventIdentity(e)]) || normalizeEventColor(f?.typeColors?.[e.eventType ?? "other"]) ||
    normalizeEventColor(e.color) || readEventPresentation(e.payload).color || EVENT_SOURCE_COLORS[eventSourceGroup(e)];
}
