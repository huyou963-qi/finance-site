/**
 * K 线事件标记图层偏好（localStorage）。
 */

import type { EventImportance } from "@prisma/client";
import type { EventExpandLevel } from "@/lib/data/assetEventResolver";

const STORAGE_KEY = "chart-event-markers-prefs-v1";

export type ChartEventMarkerPrefs = {
  enabled: boolean;
  includeSec: boolean;
  includeMarket: boolean;
  minImportance: EventImportance;
  expand: EventExpandLevel;
  showLabel: boolean;
};

export const DEFAULT_CHART_EVENT_MARKER_PREFS: ChartEventMarkerPrefs = {
  enabled: true,
  includeSec: true,
  includeMarket: true,
  minImportance: "MEDIUM",
  expand: "symbol",
  showLabel: true,
};

export function loadChartEventMarkerPrefs(): ChartEventMarkerPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_CHART_EVENT_MARKER_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CHART_EVENT_MARKER_PREFS };
    const parsed = JSON.parse(raw) as Partial<ChartEventMarkerPrefs>;
    return { ...DEFAULT_CHART_EVENT_MARKER_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_CHART_EVENT_MARKER_PREFS };
  }
}

export function saveChartEventMarkerPrefs(prefs: ChartEventMarkerPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
