/**
 * 事件侧栏「列表筛选」偏好（与图表标记图层 prefs 分离）。
 */

import type { EventImportance } from "@prisma/client";
import {
  ALL_EVENT_TYPE_FAMILY_IDS,
  EVENT_TYPE_FAMILY_IDS,
  type EventTypeFamilyId,
} from "@/lib/data/eventTaxonomy";

export type EventListContextMode = "chart" | "range" | "symbol";

export type EventPanelListFilterState = {
  searchQ: string;
  typeFamilies: EventTypeFamilyId[];
  minImportance: EventImportance;
  contextMode: EventListContextMode;
  countries: string[];
  industries: string[];
  assets: string[];
  persons: string[];
  institutions: string[];
};

export const DEFAULT_EVENT_PANEL_LIST_FILTERS: EventPanelListFilterState = {
  searchQ: "",
  typeFamilies: [...ALL_EVENT_TYPE_FAMILY_IDS],
  minImportance: "MEDIUM",
  contextMode: "chart",
  countries: [],
  industries: [],
  assets: [],
  persons: [],
  institutions: [],
};

const STORAGE_KEY = "event-panel-list-filters-v1";

function isFamilyId(v: unknown): v is EventTypeFamilyId {
  return (
    typeof v === "string" &&
    (EVENT_TYPE_FAMILY_IDS as readonly string[]).includes(v)
  );
}

function isContextMode(v: unknown): v is EventListContextMode {
  return v === "chart" || v === "range" || v === "symbol";
}

function isImportance(v: unknown): v is EventImportance {
  return v === "LOW" || v === "MEDIUM" || v === "HIGH" || v === "CRITICAL";
}

export function sanitizeEventPanelListFilters(
  raw: Partial<EventPanelListFilterState> | null | undefined,
): EventPanelListFilterState {
  const base = { ...DEFAULT_EVENT_PANEL_LIST_FILTERS };
  if (!raw) return base;

  const families = Array.isArray(raw.typeFamilies)
    ? raw.typeFamilies.filter(isFamilyId)
    : base.typeFamilies;
  return {
    searchQ: typeof raw.searchQ === "string" ? raw.searchQ : "",
    typeFamilies: families.length ? [...new Set(families)] : [...ALL_EVENT_TYPE_FAMILY_IDS],
    minImportance: isImportance(raw.minImportance)
      ? raw.minImportance
      : base.minImportance,
    contextMode: isContextMode(raw.contextMode) ? raw.contextMode : base.contextMode,
    countries: Array.isArray(raw.countries)
      ? raw.countries.filter((x): x is string => typeof x === "string")
      : [],
    industries: Array.isArray(raw.industries)
      ? raw.industries.filter((x): x is string => typeof x === "string")
      : [],
    assets: Array.isArray(raw.assets)
      ? raw.assets.filter((x): x is string => typeof x === "string")
      : [],
    persons: Array.isArray(raw.persons)
      ? raw.persons.filter((x): x is string => typeof x === "string")
      : [],
    institutions: Array.isArray(raw.institutions)
      ? raw.institutions.filter((x): x is string => typeof x === "string")
      : [],
  };
}

export function loadEventPanelListFilters(): EventPanelListFilterState {
  if (typeof window === "undefined") return { ...DEFAULT_EVENT_PANEL_LIST_FILTERS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EVENT_PANEL_LIST_FILTERS };
    return sanitizeEventPanelListFilters(
      JSON.parse(raw) as Partial<EventPanelListFilterState>,
    );
  } catch {
    return { ...DEFAULT_EVENT_PANEL_LIST_FILTERS };
  }
}

export function saveEventPanelListFilters(prefs: EventPanelListFilterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function hasActiveEventPanelListFilters(f: EventPanelListFilterState): boolean {
  const allFamilies = isAllTypeFamiliesSelected(f.typeFamilies);
  return Boolean(
    f.searchQ.trim() ||
      !allFamilies ||
      f.minImportance !== DEFAULT_EVENT_PANEL_LIST_FILTERS.minImportance ||
      f.countries.length ||
      f.industries.length ||
      f.assets.length ||
      f.persons.length ||
      f.institutions.length,
  );
}

/** 类型族是否全选（不限制类型） */
export function isAllTypeFamiliesSelected(
  families: readonly EventTypeFamilyId[],
): boolean {
  return (
    families.length >= EVENT_TYPE_FAMILY_IDS.length ||
    EVENT_TYPE_FAMILY_IDS.every((id) => families.includes(id))
  );
}
