/**
 * 兼容旧图表标记 prefs（迁移到 eventViewFilters）。
 * 新代码请直接使用 EventViewFilterState。
 */

import type { EventImportance } from "@prisma/client";
import type { EventExpandLevel } from "@/lib/data/assetEventResolver";
import {
  DEFAULT_EVENT_VIEW_FILTERS,
  loadEventViewFilters,
  saveEventViewFilters,
  type EventViewFilterState,
} from "@/lib/chart/eventViewFilters";

/** @deprecated 使用 EventViewFilterState */
export type ChartEventMarkerPrefs = {
  enabled: boolean;
  includeSec: boolean;
  includeMarket: boolean;
  minImportance: EventImportance;
  expand: EventExpandLevel;
  showLabel: boolean;
};

/** @deprecated */
export const DEFAULT_CHART_EVENT_MARKER_PREFS: ChartEventMarkerPrefs = {
  enabled: DEFAULT_EVENT_VIEW_FILTERS.markersEnabled,
  includeSec: DEFAULT_EVENT_VIEW_FILTERS.includeSec,
  includeMarket: DEFAULT_EVENT_VIEW_FILTERS.includeMarket,
  minImportance: DEFAULT_EVENT_VIEW_FILTERS.minImportance,
  expand: "symbol",
  showLabel: DEFAULT_EVENT_VIEW_FILTERS.showLabel,
};

export function markerPrefsFromViewFilters(
  f: EventViewFilterState,
): ChartEventMarkerPrefs {
  return {
    enabled: f.markersEnabled,
    includeSec: f.includeSec,
    includeMarket: f.includeMarket,
    minImportance: f.minImportance,
    expand: "symbol",
    showLabel: f.showLabel,
  };
}

export function patchViewFiltersFromMarkerPrefs(
  prev: EventViewFilterState,
  prefs: ChartEventMarkerPrefs,
): EventViewFilterState {
  return {
    ...prev,
    markersEnabled: prefs.enabled,
    includeSec: prefs.includeSec,
    includeMarket: prefs.includeMarket,
    minImportance: prefs.minImportance,
    showLabel: prefs.showLabel,
  };
}

/** @deprecated */
export function loadChartEventMarkerPrefs(): ChartEventMarkerPrefs {
  return markerPrefsFromViewFilters(loadEventViewFilters());
}

/** @deprecated */
export function saveChartEventMarkerPrefs(prefs: ChartEventMarkerPrefs): void {
  const cur = loadEventViewFilters();
  saveEventViewFilters(patchViewFiltersFromMarkerPrefs(cur, prefs));
}
