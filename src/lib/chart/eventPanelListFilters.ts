/**
 * 兼容旧列表筛选 API（迁移到 eventViewFilters）。
 */

export {
  DEFAULT_EVENT_VIEW_FILTERS as DEFAULT_EVENT_PANEL_LIST_FILTERS,
  hasActiveEventViewContentFilters as hasActiveEventPanelListFilters,
  isAllTypeFamiliesSelected,
  loadEventViewFilters as loadEventPanelListFilters,
  saveEventViewFilters as saveEventPanelListFilters,
  sanitizeEventViewFilters as sanitizeEventPanelListFilters,
  type EventViewFilterState as EventPanelListFilterState,
} from "@/lib/chart/eventViewFilters";

/** @deprecated 使用 EventScopeMode */
export type EventListContextMode = "chart" | "range" | "symbol";
