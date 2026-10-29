import type { LocalEventPack } from "@/lib/equity/localEventPacks";
import { localPackEventId } from "@/lib/equity/localEventPacks";
import { eventFiltersForSource, updateEventSourceFilters, type EventViewFilterState } from "./eventViewFilters";

/** Expand old shared external-ID preferences into package-scoped keys exactly once. */
export function migrateLocalEventPreferences(state: EventViewFilterState, packs: LocalEventPack[]): EventViewFilterState {
  const keys = new Map<string, string[]>();
  for (const pack of packs.filter(p => p.storage !== "cloud")) for (const event of pack.events) {
    const externalId = String(event.externalId ?? event.id ?? "");
    if (!externalId) continue;
    keys.set(externalId, [...(keys.get(externalId) ?? []), localPackEventId(pack.id, externalId)]);
  }
  const currentKeys = new Set([...keys.values()].flat());
  const user = eventFiltersForSource(state, "user");
  let changed = false;
  const migrateIds = (ids?: string[]) => ids?.flatMap(id => {
    if (currentKeys.has(id) || !keys.has(id)) return [id];
    changed = true; return keys.get(id)!;
  });
  const hiddenEventIds = migrateIds(user.hiddenEventIds), hiddenMarkerIds = migrateIds(user.hiddenMarkerIds);
  const eventColors = { ...user.eventColors };
  for (const [id, color] of Object.entries(user.eventColors ?? {})) {
    if (currentKeys.has(id) || !keys.has(id)) continue;
    for (const key of keys.get(id)!) if (!eventColors[key]) eventColors[key] = color;
    delete eventColors[id]; changed = true;
  }
  return changed ? updateEventSourceFilters(state, "user", { ...user, hiddenEventIds, hiddenMarkerIds, eventColors }) : state;
}
