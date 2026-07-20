/**
 * 事件记录器统一筛选状态（图表标记 + 列表共用）。
 */

import type { EventImportance } from "@prisma/client";
import {
  ALL_EVENT_TYPE_FAMILY_IDS,
  EVENT_TYPE_FAMILY_IDS,
  type EventTypeFamilyId,
} from "@/lib/data/eventTaxonomy";
import type { EventScopeMode } from "@/lib/data/assetEventResolver";

export type EventViewFilterState = {
  searchQ: string;
  typeFamilies: EventTypeFamilyId[];
  minImportance: EventImportance;
  scopeMode: EventScopeMode;
  countries: string[];
  industries: string[];
  assets: string[];
  persons: string[];
  institutions: string[];
  /** 图上标记总开关 */
  markersEnabled: boolean;
  includeSec: boolean;
  includeMarket: boolean;
  showLabel: boolean;
};

export const DEFAULT_EVENT_VIEW_FILTERS: EventViewFilterState = {
  searchQ: "",
  typeFamilies: [...ALL_EVENT_TYPE_FAMILY_IDS],
  minImportance: "MEDIUM",
  scopeMode: "follow",
  countries: [],
  industries: [],
  assets: [],
  persons: [],
  institutions: [],
  markersEnabled: true,
  includeSec: true,
  includeMarket: true,
  showLabel: true,
};

const STORAGE_KEY = "event-view-filters-v1";
const LEGACY_LIST_KEY = "event-panel-list-filters-v1";
const LEGACY_MARKER_KEY = "chart-event-markers-prefs-v1";

function isFamilyId(v: unknown): v is EventTypeFamilyId {
  return (
    typeof v === "string" &&
    (EVENT_TYPE_FAMILY_IDS as readonly string[]).includes(v)
  );
}

function isScopeMode(v: unknown): v is EventScopeMode {
  return v === "follow" || v === "range";
}

function isImportance(v: unknown): v is EventImportance {
  return v === "LOW" || v === "MEDIUM" || v === "HIGH" || v === "CRITICAL";
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

export function sanitizeEventViewFilters(
  raw: Partial<EventViewFilterState> | null | undefined,
): EventViewFilterState {
  const base = { ...DEFAULT_EVENT_VIEW_FILTERS };
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
    scopeMode: isScopeMode(raw.scopeMode) ? raw.scopeMode : base.scopeMode,
    countries: asStringArray(raw.countries),
    industries: asStringArray(raw.industries),
    assets: asStringArray(raw.assets),
    persons: asStringArray(raw.persons),
    institutions: asStringArray(raw.institutions),
    markersEnabled:
      typeof raw.markersEnabled === "boolean"
        ? raw.markersEnabled
        : base.markersEnabled,
    includeSec:
      typeof raw.includeSec === "boolean" ? raw.includeSec : base.includeSec,
    includeMarket:
      typeof raw.includeMarket === "boolean"
        ? raw.includeMarket
        : base.includeMarket,
    showLabel:
      typeof raw.showLabel === "boolean" ? raw.showLabel : base.showLabel,
  };
}

function migrateFromLegacy(): EventViewFilterState | null {
  try {
    const listRaw = localStorage.getItem(LEGACY_LIST_KEY);
    const markerRaw = localStorage.getItem(LEGACY_MARKER_KEY);
    if (!listRaw && !markerRaw) return null;

    const list = listRaw
      ? (JSON.parse(listRaw) as Record<string, unknown>)
      : {};
    const marker = markerRaw
      ? (JSON.parse(markerRaw) as Record<string, unknown>)
      : {};

    const contextMode = list.contextMode;
    let scopeMode: EventScopeMode = "follow";
    if (contextMode === "range") scopeMode = "range";

    return sanitizeEventViewFilters({
      searchQ: typeof list.searchQ === "string" ? list.searchQ : "",
      typeFamilies: Array.isArray(list.typeFamilies)
        ? (list.typeFamilies as EventTypeFamilyId[])
        : undefined,
      minImportance: isImportance(list.minImportance)
        ? list.minImportance
        : isImportance(marker.minImportance)
          ? marker.minImportance
          : undefined,
      scopeMode,
      countries: asStringArray(list.countries),
      industries: asStringArray(list.industries),
      assets: asStringArray(list.assets),
      persons: asStringArray(list.persons),
      institutions: asStringArray(list.institutions),
      markersEnabled:
        typeof marker.enabled === "boolean" ? marker.enabled : undefined,
      includeSec:
        typeof marker.includeSec === "boolean" ? marker.includeSec : undefined,
      includeMarket:
        typeof marker.includeMarket === "boolean"
          ? marker.includeMarket
          : undefined,
      showLabel:
        typeof marker.showLabel === "boolean" ? marker.showLabel : undefined,
    });
  } catch {
    return null;
  }
}

export function loadEventViewFilters(): EventViewFilterState {
  if (typeof window === "undefined") return { ...DEFAULT_EVENT_VIEW_FILTERS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return sanitizeEventViewFilters(
        JSON.parse(raw) as Partial<EventViewFilterState>,
      );
    }
    const migrated = migrateFromLegacy();
    if (migrated) {
      saveEventViewFilters(migrated);
      return migrated;
    }
    return { ...DEFAULT_EVENT_VIEW_FILTERS };
  } catch {
    return { ...DEFAULT_EVENT_VIEW_FILTERS };
  }
}

export function saveEventViewFilters(prefs: EventViewFilterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function isAllTypeFamiliesSelected(
  families: readonly EventTypeFamilyId[],
): boolean {
  return (
    families.length >= EVENT_TYPE_FAMILY_IDS.length ||
    EVENT_TYPE_FAMILY_IDS.every((id) => families.includes(id))
  );
}

export function hasActiveEventViewContentFilters(
  f: EventViewFilterState,
): boolean {
  const allFamilies = isAllTypeFamiliesSelected(f.typeFamilies);
  return Boolean(
    f.searchQ.trim() ||
      !allFamilies ||
      f.minImportance !== DEFAULT_EVENT_VIEW_FILTERS.minImportance ||
      f.countries.length ||
      f.industries.length ||
      f.assets.length ||
      f.persons.length ||
      f.institutions.length,
  );
}

/** 类型族 → chart-markers types= 查询（前缀） */
export function typeFamiliesToQueryPrefixes(
  families: readonly EventTypeFamilyId[],
): string[] | undefined {
  if (isAllTypeFamiliesSelected(families)) return undefined;
  return [...families];
}
