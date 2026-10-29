import { milestoneToMarketEventDto } from "@/lib/equity/companyMilestones";
import { decodeLocalEventPack, packAppliesToSymbol, type EventImportReceipt, type LocalEventPack } from "@/lib/equity/localEventPacks";
import { EVENT_EXCLUSION_LABELS, selectChartEvents } from "./eventSelection";
import type { EventViewFilterState } from "./eventViewFilters";

/** Last-import inspection uses the existing selection pipeline; no preference changes. */
export function describeImportedBatch(receipt: EventImportReceipt, packs: LocalEventPack[], symbol: string, filters: EventViewFilterState, from: string, to: string) {
  const pack = packs.find(p => p.id === receipt.packId);
  if (!pack) return { pack: null, rows: [], visible: 0, missing: receipt.externalIds.length };
  const ids = new Set(receipt.externalIds);
  const events = decodeLocalEventPack(pack).filter(e => ids.has(e.externalId));
  const dtos = events.map(milestoneToMarketEventDto);
  const selected = selectChartEvents(dtos, [], filters, from, to);
  const visibleIds = new Set(selected.sourceEvents.user.map(e => e.id));
  const excluded = new Map(selected.excludedEvents.user.map(e => [e.event.id, e.reasons]));
  const rows = dtos.map(event => {
    const reasons = !pack.enabled ? ["事件包已停用"] : !packAppliesToSymbol(pack, symbol) ? [`事件包不适用于 ${symbol}`] :
      (excluded.get(event.id) ?? []).map(r => EVENT_EXCLUSION_LABELS[r]);
    return { event, reasons, visible: pack.enabled && packAppliesToSymbol(pack, symbol) && visibleIds.has(event.id) };
  });
  return { pack, rows, visible: rows.filter(r => r.visible).length, missing: receipt.externalIds.length - rows.length };
}
