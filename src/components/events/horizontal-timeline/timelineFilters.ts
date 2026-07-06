import type { EventImportance, MarketEventDto } from "@/lib/data/marketEvents";
import { isEraHeaderEvent } from "@/lib/data/marketEventTimeline";

/** 时间轴筛选常用事件类型（不含「时代阶段」） */
export const TIMELINE_FILTER_EVENT_TYPES = [
  "政策",
  "地缘",
  "市场异动",
  "央行决议",
  "战争",
  "监管",
  "财报",
  "条约",
  "自然灾害",
  "其他",
] as const;

export type TimelineFilterState = {
  country: string;
  importances: EventImportance[];
  eventTypes: string[];
};

export const DEFAULT_TIMELINE_FILTERS: TimelineFilterState = {
  country: "US",
  importances: [],
  eventTypes: [],
};

export function hasActiveTimelineFilters(f: TimelineFilterState): boolean {
  return f.country !== "US" || f.importances.length > 0 || f.eventTypes.length > 0;
}

export function applyTimelineFilters(
  events: MarketEventDto[],
  filters: TimelineFilterState,
): MarketEventDto[] {
  return events.filter((e) => {
    if (e.eventType === "时代阶段" || isEraHeaderEvent(e)) return true;
    if (filters.country && !e.countries.includes(filters.country)) return false;
    if (filters.importances.length > 0 && !filters.importances.includes(e.importance)) {
      return false;
    }
    if (
      filters.eventTypes.length > 0 &&
      (!e.eventType || !filters.eventTypes.includes(e.eventType))
    ) {
      return false;
    }
    return true;
  });
}

export function toggleFilterItem<T extends string>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
