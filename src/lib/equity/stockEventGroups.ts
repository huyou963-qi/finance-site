import type { StockEvent } from "./stockEvents";

type PeriodReference = { periodEnd: string; fiscalQuarter: number | null };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** No proximity-only association: match an explicit period end, or uniquely corroborate a title fiscal quarter. */
export function releasePeriodEnd(text: string, filedAt: string, references: PeriodReference[]): string | null {
  const candidates = new Set<string>();
  const pattern = /(?:quarter|year|three\s+months|twelve\s+months)\s+ended\s+([a-z]+)\s+(\d{1,2})\s*,?\s*(20\d{2})/gi;
  for (const match of text.matchAll(pattern)) {
    const month = MONTHS.indexOf(match[1].toLowerCase());
    if (month < 0) continue;
    const day = `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
    const date = new Date(`${day}T00:00:00Z`);
    const lag = new Date(filedAt).getTime() - date.getTime();
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day && lag >= 0 && lag <= 120 * 86_400_000) candidates.add(day);
  }
  if (candidates.size) return [...candidates].sort().at(-1)!;
  const title = text.slice(0, 600).match(/\bQ([1-4])\s*(?:FY\s*)?(20\d{2})\b/i);
  if (!title) return null;
  const matches = new Set(references.filter(reference => {
    const lag = new Date(filedAt).getTime() - new Date(reference.periodEnd).getTime();
    return reference.fiscalQuarter === Number(title[1]) && reference.periodEnd.startsWith(title[2]) && lag >= 0 && lag <= 120 * 86_400_000;
  }).map(reference => reference.periodEnd));
  return matches.size === 1 ? [...matches][0] : null;
}

export type StockEventGroup = { key: string; date: string; periodEnd: string | null; events: StockEvent[] };

/** Group after UI filtering. Revisions remain individually linked and dated within the group. */
export function groupStockEvents(events: StockEvent[]): StockEventGroup[] {
  const groups = new Map<string, StockEventGroup>();
  events.forEach((event, index) => {
    const earnings = event.type === "earnings" || event.type === "annual" || (event.type === "8k" && event.items.includes("2.02"));
    const periodEnd = earnings ? event.disclosure?.periodEnd ?? null : null;
    const key = periodEnd ? `period:${periodEnd}` : `event:${event.disclosure?.accession ?? `${event.date}:${event.type}:${index}`}`;
    const group = groups.get(key) ?? { key, date: event.date, periodEnd, events: [] };
    group.events.push(event);
    if (event.date > group.date) group.date = event.date;
    groups.set(key, group);
  });
  return [...groups.values()].map(group => ({ ...group, events: group.events.sort((a, b) => b.date.localeCompare(a.date)) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
