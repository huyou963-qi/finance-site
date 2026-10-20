import type { EventImportance } from "@prisma/client";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { defaultMarkerLabel, markerShapeFor, normalizeEventType, type MarkerShape } from "@/lib/data/eventTaxonomy";
import { classifyMacroEventSurprise } from "@/lib/data/macroEventSurprise";
import { eventDisplayColor } from "./eventSelection";
function isoDateToUnixSec(isoDate: string): number { return Math.floor(Date.parse(`${isoDate.slice(0,10)}T00:00:00.000Z`) / 1000); }

export type ChartEventMarkerSource = "stock_derived" | "market_event" | "user_local";

export type ChartEventMarker = {
  id: string;
  time: number;
  datePrecision?: "DATE" | "DATETIME";
  eventTime?: number;
  surpriseScore?: number;
  largeSurprise?: boolean;
  surpriseStrength?: number;
  label: string;
  shape: MarkerShape;
  color: string;
  importance: EventImportance;
  eventType: string;
  scope: string;
  title: string;
  source: ChartEventMarkerSource;
  sourceUrl?: string | null;
};

/** Aggregation changes density, never event identity. Selection takes precedence over surprise. */
export function groupEventMarkers(markers: ChartEventMarker[], selectedId?: string | null) {
  const byBar = new Map<number, ChartEventMarker[]>();
  for (const marker of markers) {
    const group = byBar.get(marker.time) ?? [];
    group.push(marker); byBar.set(marker.time, group);
  }
  return [...byBar.values()].map(items => {
    const list = [...items].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) ||
      Number(Boolean(b.largeSurprise)) - Number(Boolean(a.largeSurprise)) || (b.surpriseStrength ?? 0) - (a.surpriseStrength ?? 0));
    return { primary: list[0], extra: list.length - 1, events: list };
  });
}

export function marketToMarker(ev: MarketEventDto): ChartEventMarker {
  const surprise = classifyMacroEventSurprise(ev.eventType === "macro.release" ? ev.payload : null);
  const eventType = normalizeEventType(ev.eventType) ?? ev.eventType ?? "other";
  const label =
    ev.markerLabel?.trim() ||
    defaultMarkerLabel(eventType) ||
    (ev.title?.slice(0, 4) ?? "事件");
  return {
    id: ev.id,
    time: ev.datePrecision === "DATETIME" ? Math.floor(Date.parse(ev.occurredAt) / 1000) : isoDateToUnixSec(ev.occurredAt),
    datePrecision: ev.datePrecision,
    largeSurprise: surprise.level === "large",
    surpriseStrength: surprise.decisive?.strength,
    label: `${surprise.level === "large" ? "◆" : ""}${label.slice(0, 4)}`,
    shape: markerShapeFor(eventType),
    color: eventDisplayColor(ev),
    importance: ev.importance,
    eventType,
    scope: ev.scope,
    title: ev.title?.trim() || ev.content.slice(0, 80),
    source: ev.sourceKind === "user_local" ? "user_local" : ev.sourceKind === "sec" ? "stock_derived" : "market_event",
    sourceUrl: ev.sourceUrl,
  };
}
