import type { MarketEventDto } from "@/lib/data/marketEvents";
import {
  findEraCatalogEntryByDate,
  findEraCatalogEntryBySeedKey,
} from "@/lib/data/usHistoryEraCatalog";

export const ERA_EVENT_TYPE = "时代阶段";

const MARKER_RE = /\[([a-zA-Z]+):([^\]]+)\]/g;

export type ParsedEventMarkers = {
  seedKey: string | null;
  eraParent: string | null;
  eraTag: string | null;
  eraPhase: string | null;
  eraDateFrom: string | null;
  eraDateTo: string | null;
  foldable: boolean;
};

export type TimelineEraGroup = {
  era: MarketEventDto;
  meta: ParsedEventMarkers;
  children: MarketEventDto[];
  defaultExpanded: boolean;
  sortIndex: number;
};

export type EventTimelineModel = {
  groups: TimelineEraGroup[];
  orphans: MarketEventDto[];
  hasEraStructure: boolean;
};

export function parseEventMarkers(content: string): ParsedEventMarkers {
  const out: ParsedEventMarkers = {
    seedKey: null,
    eraParent: null,
    eraTag: null,
    eraPhase: null,
    eraDateFrom: null,
    eraDateTo: null,
    foldable: false,
  };

  for (const m of content.matchAll(MARKER_RE)) {
    const key = m[1];
    const value = m[2]?.trim() ?? "";
    if (!value) continue;
    if (key === "seed") out.seedKey = value;
    else if (key === "era") {
      if (value.startsWith("parent:")) out.eraParent = value.slice("parent:".length);
      else if (value.startsWith("tag:")) out.eraTag = value.slice("tag:".length);
      else if (value.startsWith("phase:")) out.eraPhase = value.slice("phase:".length);
      else if (value.startsWith("dateFrom:")) out.eraDateFrom = value.slice("dateFrom:".length);
      else if (value.startsWith("dateTo:")) out.eraDateTo = value.slice("dateTo:".length);
      else if (value === "collapse:foldable") out.foldable = true;
    }
  }

  return out;
}

export function isEraHeaderEvent(event: MarketEventDto): boolean {
  if (event.eventType === ERA_EVENT_TYPE || event.eventType === "era") return true;
  return parseEventMarkers(event.content).foldable;
}

function eventDateMs(event: MarketEventDto): number {
  return Date.parse(event.occurredAt.slice(0, 10));
}

function sortEventsAsc(events: MarketEventDto[]): MarketEventDto[] {
  return [...events].sort((a, b) => {
    const diff = eventDateMs(a) - eventDateMs(b);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

export function formatEraDateRange(meta: ParsedEventMarkers, era: MarketEventDto): string {
  const from = meta.eraDateFrom?.slice(0, 10);
  const toRaw = meta.eraDateTo?.trim();
  const to =
    toRaw && toRaw !== "present" && toRaw !== "今"
      ? toRaw.slice(0, 10)
      : null;
  if (from && to) {
    const fromY = from.slice(0, 4);
    const toY = to.slice(0, 4);
    if (from.slice(5) === "01-01" && to.slice(5) === "12-31" && fromY !== toY) {
      return `${fromY} — ${toY}`;
    }
    return `${from} — ${to}`;
  }
  if (from) return `${from.slice(0, 4)} —`;
  return era.occurredAt.slice(0, 4);
}

export function buildEventTimeline(events: MarketEventDto[]): EventTimelineModel {
  const eraBySeed = new Map<string, MarketEventDto>();
  const eraByTag = new Map<string, MarketEventDto>();
  const eraHeaders: MarketEventDto[] = [];
  const childCandidates: MarketEventDto[] = [];

  for (const ev of events) {
    if (isEraHeaderEvent(ev)) {
      eraHeaders.push(ev);
      const meta = parseEventMarkers(ev.content);
      if (meta.seedKey) eraBySeed.set(meta.seedKey, ev);
      if (meta.eraTag) eraByTag.set(meta.eraTag, ev);
      const tagFromIndustry = ev.industries.find(
        (t) => t !== "时代阶段" && t !== ERA_EVENT_TYPE,
      );
      if (tagFromIndustry) eraByTag.set(tagFromIndustry, ev);
    } else {
      childCandidates.push(ev);
    }
  }

  if (eraHeaders.length === 0) {
    return {
      groups: [],
      orphans: sortEventsAsc(events),
      hasEraStructure: false,
    };
  }

  const childrenByEraId = new Map<string, MarketEventDto[]>();
  const orphans: MarketEventDto[] = [];

  function resolveParentEra(ev: MarketEventDto, meta: ParsedEventMarkers): MarketEventDto | null {
    let parent =
      (meta.eraParent && eraBySeed.get(meta.eraParent)) ||
      (meta.eraTag && eraByTag.get(meta.eraTag)) ||
      null;

    if (!parent && meta.eraTag) {
      parent = eraByTag.get(meta.eraTag) ?? null;
    }

    if (!parent) {
      const tagHit = ev.industries.find((t) => eraByTag.has(t));
      if (tagHit) parent = eraByTag.get(tagHit)!;
    }

    // 旧数据可能无 [era:parent]：按 seedKey 或发生日期归入时代
    if (!parent && meta.eraParent) {
      const entry = findEraCatalogEntryBySeedKey(meta.eraParent);
      if (entry) parent = eraBySeed.get(entry.seedKey) ?? eraByTag.get(entry.tag) ?? null;
    }

    if (!parent) {
      const entry = findEraCatalogEntryByDate(ev.occurredAt);
      if (entry) parent = eraBySeed.get(entry.seedKey) ?? eraByTag.get(entry.tag) ?? null;
    }

    return parent;
  }

  for (const ev of childCandidates) {
    const meta = parseEventMarkers(ev.content);
    const parent = resolveParentEra(ev, meta);

    if (parent) {
      const list = childrenByEraId.get(parent.id) ?? [];
      list.push(ev);
      childrenByEraId.set(parent.id, list);
    } else {
      orphans.push(ev);
    }
  }

  const sortedEraHeaders = sortEventsAsc(eraHeaders);
  const groups: TimelineEraGroup[] = sortedEraHeaders.map((era, sortIndex) => {
    const meta = parseEventMarkers(era.content);
    const defaultExpanded = sortIndex < 3;
    return {
      era,
      meta,
      children: sortEventsAsc(childrenByEraId.get(era.id) ?? []),
      defaultExpanded,
      sortIndex,
    };
  });

  return {
    groups,
    orphans: sortEventsAsc(orphans),
    hasEraStructure: true,
  };
}

export function cyclePhaseLabel(phase: string | null | undefined): string | null {
  if (!phase?.trim()) return null;
  return phase.trim();
}
