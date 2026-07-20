"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  meetsMinImportance,
  type MarketEventDto,
} from "@/lib/data/marketEvents";
import {
  EMPTY_EVENT_PANEL_FILTERS,
  EventPanelFilters,
  hasActiveEventPanelFilters,
  type EventPanelFilterState,
} from "@/components/events/EventPanelFilters";
import {
  emptyEventForm,
  EventFormModal,
  eventToFormValues,
} from "@/components/events/EventFormModal";
import {
  EventTimelineView,
  filterTimelineGroups,
  timelineVisibleEvents,
} from "@/components/events/EventTimelineView";
import {
  buildEventTimeline,
  isEraHeaderEvent,
} from "@/lib/data/marketEventTimeline";
import {
  eventTypeMatchesFamilies,
  isEraEventType,
} from "@/lib/data/eventTaxonomy";
import {
  isAllTypeFamiliesSelected,
  loadEventViewFilters,
  saveEventViewFilters,
  typeFamiliesToQueryPrefixes,
  type EventViewFilterState,
} from "@/lib/chart/eventViewFilters";
import { eventHitsExplicitFilters } from "@/lib/data/assetEventResolver";
import {
  applySymbolDraftToFilters,
  classifyChartSymbol,
  deriveEventFilterDraft,
  type ChartSymbolProfile,
} from "@/lib/data/chartSymbolProfile";

const TRACKING_STORAGE_KEY = "event-panel-tracking-v1";

export type EventPanelProps = {
  rangeFrom?: string | null;
  rangeTo?: string | null;
  trackDate?: string | null;
  contextDate?: string | null;
  contextCountries?: string[];
  contextIndustries?: string[];
  contextAssets?: string[];
  contextMacroKeys?: string[];
  lookbackDays?: number;
  lookaheadDays?: number;
  eventTracking?: boolean;
  onEventTrackingChange?: (enabled: boolean) => void;
  compact?: boolean;
  embedded?: boolean;
  className?: string;
  /** 行情 K 线联动：列表走 /api/events/for-chart */
  chartSymbol?: string | null;
  /**
   * 受控统一筛选（图+列表）。传入时由父组件持有状态；
   * 不传则面板内部管理（embedded 宏观等）。
   */
  viewFilters?: EventViewFilterState;
  onViewFiltersChange?: (next: EventViewFilterState) => void;
};

function buildContextUrl(
  props: Pick<
    EventPanelProps,
    | "contextDate"
    | "contextCountries"
    | "contextIndustries"
    | "contextAssets"
    | "contextMacroKeys"
    | "lookbackDays"
    | "lookaheadDays"
  >,
): string | null {
  if (!props.contextDate) return null;
  const sp = new URLSearchParams({ date: props.contextDate });
  sp.set("lookback", String(props.lookbackDays ?? 7));
  sp.set("lookahead", String(props.lookaheadDays ?? 7));
  if (props.contextCountries?.length)
    sp.set("countries", props.contextCountries.join(","));
  if (props.contextIndustries?.length)
    sp.set("industries", props.contextIndustries.join(","));
  if (props.contextAssets?.length) sp.set("assets", props.contextAssets.join(","));
  if (props.contextMacroKeys?.length)
    sp.set("macroKeys", props.contextMacroKeys.join(","));
  return `/api/events/context?${sp.toString()}`;
}

function buildRangeUrl(rangeFrom: string, rangeTo: string): string {
  const sp = new URLSearchParams({
    from: rangeFrom,
    to: rangeTo,
    limit: "2000",
  });
  return `/api/events?${sp.toString()}`;
}

function buildForChartUrl(
  symbol: string,
  rangeFrom: string,
  rangeTo: string,
  filters: EventViewFilterState,
): string {
  const sp = new URLSearchParams({
    symbol,
    from: rangeFrom,
    to: rangeTo,
    scopeMode: filters.scopeMode,
    includeSec: filters.includeSec ? "1" : "0",
    includeMarket: filters.includeMarket ? "1" : "0",
    minImportance: filters.minImportance,
  });
  if (filters.assets.length) sp.set("assets", filters.assets.join(","));
  if (filters.industries.length)
    sp.set("industries", filters.industries.join(","));
  if (filters.countries.length)
    sp.set("countries", filters.countries.join(","));
  const types = typeFamiliesToQueryPrefixes(filters.typeFamilies);
  if (types?.length) sp.set("types", types.join(","));
  return `/api/events/for-chart?${sp.toString()}`;
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

function findNearestEventId(
  events: MarketEventDto[],
  trackDate: string,
): string | null {
  const candidates = events.filter((ev) => !isEraHeaderEvent(ev));
  const targetMs = Date.parse(trackDate.slice(0, 10));
  if (!Number.isFinite(targetMs) || candidates.length === 0) return null;
  let bestId = candidates[0].id;
  let bestDiff = Infinity;
  for (const ev of candidates) {
    const diff = Math.abs(eventDateMs(ev) - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestId = ev.id;
    }
  }
  return bestId;
}

export function eventMatchesFilters(
  event: MarketEventDto,
  filters: EventPanelFilterState,
  opts?: { skipTagContext?: boolean },
): boolean {
  const q = filters.searchQ.trim().toLowerCase();
  if (q) {
    const hit =
      event.title?.toLowerCase().includes(q) ||
      event.content.toLowerCase().includes(q);
    if (!hit) return false;
  }
  if (!meetsMinImportance(event.importance, filters.minImportance)) return false;
  if (!eventTypeMatchesFamilies(event.eventType, filters.typeFamilies)) {
    return false;
  }
  if (!opts?.skipTagContext && filters.scopeMode !== "range") {
    const tagOk = eventHitsExplicitFilters(event, {
      assets: filters.assets,
      industries: filters.industries,
      countries: filters.countries,
    });
    if (!tagOk) return false;
  }
  if (filters.persons.length) {
    if (!filters.persons.some((p) => event.persons.includes(p))) return false;
  }
  if (filters.institutions.length) {
    if (!filters.institutions.some((i) => event.institutions.includes(i)))
      return false;
  }
  return true;
}

function filterEvents(
  events: MarketEventDto[],
  filters: EventPanelFilterState,
  opts?: { skipTagContext?: boolean },
): MarketEventDto[] {
  return events.filter((e) => eventMatchesFilters(e, filters, opts));
}

function isSecDerivedEvent(event: MarketEventDto): boolean {
  return event.sourceKind === "sec" || event.id.startsWith("stock:");
}

export function EventPanel({
  rangeFrom,
  rangeTo,
  trackDate,
  contextDate,
  contextCountries = [],
  contextIndustries = [],
  contextAssets = [],
  contextMacroKeys = [],
  lookbackDays = 7,
  lookaheadDays = 7,
  eventTracking: eventTrackingProp,
  onEventTrackingChange,
  compact = false,
  embedded = false,
  className = "",
  chartSymbol = null,
  viewFilters: viewFiltersProp,
  onViewFiltersChange,
}: EventPanelProps) {
  const [events, setEvents] = useState<MarketEventDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<MarketEventDto | null>(null);
  const [trackingInternal, setTrackingInternal] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [filtersInternal, setFiltersInternal] = useState<EventViewFilterState>(
    EMPTY_EVENT_PANEL_FILTERS,
  );
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [symbolProfile, setSymbolProfile] = useState<ChartSymbolProfile | null>(
    null,
  );
  const listScrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const lastScrolledTrackDateRef = useRef<string | null>(null);
  const lastAppliedSymbolRef = useRef<string | null>(null);

  const controlled = viewFiltersProp !== undefined;
  const filters = viewFiltersProp ?? filtersInternal;
  const setFilters = useCallback(
    (next: EventViewFilterState | ((prev: EventViewFilterState) => EventViewFilterState)) => {
      if (controlled) {
        const resolved =
          typeof next === "function" ? next(viewFiltersProp!) : next;
        onViewFiltersChange?.(resolved);
      } else {
        setFiltersInternal(next);
      }
    },
    [controlled, onViewFiltersChange, viewFiltersProp],
  );

  const useRangeMode = Boolean(rangeFrom && rangeTo);
  const useChartList = Boolean(chartSymbol?.trim() && useRangeMode);
  const chartLinked = useChartList;

  const eventTracking = eventTrackingProp ?? trackingInternal;

  useEffect(() => {
    if (controlled) {
      setFiltersHydrated(true);
      return;
    }
    setFiltersInternal(loadEventViewFilters());
    setFiltersHydrated(true);
  }, [controlled]);

  useEffect(() => {
    if (!filtersHydrated || controlled) return;
    saveEventViewFilters(filtersInternal);
  }, [filtersInternal, filtersHydrated, controlled]);

  /** 换标的：重算草稿（覆盖类型/国家/行业/资产） */
  useEffect(() => {
    if (!filtersHydrated) return;
    const sym = chartSymbol?.trim();
    if (!sym) {
      setSymbolProfile(null);
      lastAppliedSymbolRef.current = null;
      return;
    }
    if (lastAppliedSymbolRef.current === sym) return;
    lastAppliedSymbolRef.current = sym;

    const profile = classifyChartSymbol(sym);
    const draft = deriveEventFilterDraft(profile);
    setSymbolProfile(profile);
    setFilters((prev) => applySymbolDraftToFilters(prev, draft));
  }, [chartSymbol, filtersHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // 补全个股 industries：独立 effect 调 profile 接口
  useEffect(() => {
    const sym = chartSymbol?.trim();
    if (!sym || !filtersHydrated) return;
    let cancelled = false;
    void fetch(`/api/events/symbol-profile?symbol=${encodeURIComponent(sym)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as {
          profile?: ChartSymbolProfile;
        };
      })
      .then((j) => {
        if (cancelled || !j?.profile) return;
        if (lastAppliedSymbolRef.current !== sym) return;
        setSymbolProfile(j.profile);
        if (
          (j.profile.kind === "equity" || j.profile.kind === "unknown") &&
          j.profile.industries.length
        ) {
          setFilters((prev) => {
            // 仅当仍是该标的默认资产、且行业尚未手改得与 draft 不同时补全
            const draft = deriveEventFilterDraft(j.profile!);
            if (
              prev.assets.length === 1 &&
              prev.assets[0] === j.profile!.symbol &&
              prev.industries.length === 0
            ) {
              return { ...prev, industries: [...draft.industries] };
            }
            return prev;
          });
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [chartSymbol, filtersHydrated, setFilters]);

  useEffect(() => {
    if (eventTrackingProp !== undefined) return;
    try {
      const raw = localStorage.getItem(TRACKING_STORAGE_KEY);
      if (raw === "1") setTrackingInternal(true);
    } catch {
      /* ignore */
    }
  }, [eventTrackingProp]);

  const setEventTracking = useCallback(
    (next: boolean) => {
      if (onEventTrackingChange) onEventTrackingChange(next);
      else setTrackingInternal(next);
      try {
        localStorage.setItem(TRACKING_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [onEventTrackingChange],
  );

  const resetToSymbolDefault = useCallback(() => {
    const sym = chartSymbol?.trim();
    if (!sym) return;
    const profile = symbolProfile ?? classifyChartSymbol(sym);
    const draft = deriveEventFilterDraft(profile);
    setFilters((prev) => applySymbolDraftToFilters(prev, draft));
  }, [chartSymbol, symbolProfile, setFilters]);

  const listUrl = useMemo(() => {
    if (useChartList && chartSymbol && rangeFrom && rangeTo) {
      return buildForChartUrl(
        chartSymbol.trim(),
        rangeFrom,
        rangeTo,
        filters,
      );
    }
    if (useRangeMode && rangeFrom && rangeTo) {
      return buildRangeUrl(rangeFrom, rangeTo);
    }
    return buildContextUrl({
      contextDate,
      contextCountries,
      contextIndustries,
      contextAssets,
      contextMacroKeys,
      lookbackDays,
      lookaheadDays,
    });
  }, [
    useChartList,
    chartSymbol,
    filters,
    useRangeMode,
    rangeFrom,
    rangeTo,
    contextDate,
    contextCountries,
    contextIndustries,
    contextAssets,
    contextMacroKeys,
    lookbackDays,
    lookaheadDays,
  ]);

  const eraFamilyOn =
    isAllTypeFamiliesSelected(filters.typeFamilies) ||
    filters.typeFamilies.includes("era");

  const sortedEvents = useMemo(() => sortEventsAsc(events), [events]);
  const filtersActive = hasActiveEventPanelFilters(filters);
  // for-chart 已按 tags/types/importance 预筛；客户端只补 search/人物/机构
  const skipTagContext = useChartList;
  const filteredEvents = useMemo(
    () => filterEvents(sortedEvents, filters, { skipTagContext }),
    [sortedEvents, filters, skipTagContext],
  );

  const displayModel = useMemo(() => {
    if (!eraFamilyOn) {
      const flat = filteredEvents.filter(
        (e) => !isEraHeaderEvent(e) && !isEraEventType(e.eventType),
      );
      return {
        groups: [],
        orphans: flat,
        hasEraStructure: false as const,
      };
    }
    const timelineModel = buildEventTimeline(sortedEvents);
    if (!filtersActive) return timelineModel;
    return filterTimelineGroups(timelineModel, (e) =>
      eventMatchesFilters(e, filters, { skipTagContext }),
    );
  }, [
    eraFamilyOn,
    sortedEvents,
    filteredEvents,
    filters,
    filtersActive,
    skipTagContext,
  ]);

  const trackingEvents = useMemo(() => {
    const list = displayModel.hasEraStructure
      ? timelineVisibleEvents(displayModel)
      : filteredEvents;
    return list.filter((ev) => !isEraHeaderEvent(ev));
  }, [displayModel, filteredEvents]);

  const hasVisibleTimeline = displayModel.hasEraStructure
    ? displayModel.groups.length > 0 || displayModel.orphans.length > 0
    : trackingEvents.length > 0;

  const load = useCallback(async () => {
    if (!listUrl) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    setAuthHint(null);
    try {
      const r = await fetch(listUrl, { cache: "no-store" });
      if (r.status === 401) {
        setAuthHint("登录后可查看关联事件");
        setEvents([]);
        return;
      }
      const j = (await r.json()) as { events?: MarketEventDto[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? "加载失败");
      setEvents(j.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { user?: { role?: string } };
      })
      .then((j) => setIsAdmin(j?.user?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!eventTracking || !trackDate || trackingEvents.length === 0) {
      if (!eventTracking) setHighlightedId(null);
      return;
    }
    const nearestId = findNearestEventId(trackingEvents, trackDate);
    if (!nearestId) return;
    setHighlightedId(nearestId);

    if (lastScrolledTrackDateRef.current === trackDate) return;
    lastScrolledTrackDateRef.current = trackDate;

    const el = rowRefs.current.get(nearestId);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [eventTracking, trackDate, trackingEvents]);

  useEffect(() => {
    lastScrolledTrackDateRef.current = null;
  }, [rangeFrom, rangeTo, listUrl, filters]);

  const onDelete = async (id: string) => {
    if (id.startsWith("stock:")) {
      window.alert("SEC 派生事件不可删除");
      return;
    }
    if (!window.confirm("确定删除该事件？")) return;
    const r = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      window.alert(j.error ?? "删除失败");
      return;
    }
    void load();
  };

  const formInitial = editEvent
    ? eventToFormValues(editEvent)
    : emptyEventForm(trackDate ?? contextDate ?? rangeFrom ?? undefined);

  const shellClass = embedded
    ? `flex min-h-0 flex-col overflow-hidden ${className}`
    : `flex min-h-0 flex-col overflow-hidden rounded-lg border border-fs-border/90 bg-fs-bg/60 ${className}`;

  const rangeHint =
    useRangeMode && rangeFrom && rangeTo
      ? `时间轴 ${rangeFrom} ~ ${rangeTo}${
          sortedEvents.length
            ? filtersActive
              ? ` · ${filteredEvents.length}/${sortedEvents.length} 条`
              : ` · ${sortedEvents.length} 条`
            : ""
        }`
      : contextDate
        ? `上下文 ${contextDate} ±${lookbackDays}天`
        : "调整底部时间轴以加载事件";

  return (
    <section className={shellClass}>
      <div
        className={`flex shrink-0 flex-col gap-1.5 ${embedded ? "pb-2" : "border-b border-fs-border px-2 py-1.5"}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] text-fs-muted">
              <input
                type="checkbox"
                checked={eventTracking}
                onChange={(e) => setEventTracking(e.target.checked)}
                className="h-3 w-3 shrink-0 rounded border-fs-border accent-[var(--fs-accent,#2383e2)]"
                aria-label="事件追踪：十字线移动时滚动到最近事件"
              />
              事件追踪
            </label>
            <div className="min-w-0 flex-1">
              {!embedded ? (
                <h3 className="text-[11px] font-semibold text-fs-text">事件记录</h3>
              ) : null}
              <p
                className={`truncate text-[10px] text-fs-muted ${embedded ? "" : "mt-0"}`}
              >
                {rangeHint}
                {eventTracking ? (
                  <span className="ml-1 text-[9px] text-fs-accent-text/80">
                    · 十字线联动
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => {
                  setEditEvent(null);
                  setFormOpen(true);
                }}
                className="rounded border border-fs-accent/30 px-1.5 py-0.5 text-[10px] text-fs-accent-text hover:bg-fs-accent-soft"
              >
                新建
              </button>
            ) : null}
            <Link
              href="/events"
              className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-muted hover:text-fs-text"
            >
              全部
            </Link>
          </div>
        </div>
        <EventPanelFilters
          filters={filters}
          onChange={setFilters}
          chartLinked={chartLinked}
          symbolProfile={symbolProfile}
          onResetToSymbolDefault={
            chartLinked ? resetToSymbolDefault : undefined
          }
        />
      </div>
      <div
        ref={listScrollRef}
        className={`min-h-0 flex-1 overflow-y-auto ${embedded ? "" : "px-2 py-2"} ${compact ? "max-h-48" : ""}`}
      >
        {loading ? (
          <p className="py-4 text-center text-[11px] text-fs-muted">加载中…</p>
        ) : authHint ? (
          <p className="py-4 text-center text-[11px] text-fs-muted">{authHint}</p>
        ) : error ? (
          <p className="py-4 text-center text-[11px] text-fs-negative">{error}</p>
        ) : !listUrl ? (
          <p className="py-4 text-center text-[11px] text-fs-secondary">
            {useRangeMode ? "暂无时间轴范围" : "移动图表十字线以加载事件"}
          </p>
        ) : !hasVisibleTimeline ? (
          <p className="py-4 text-center text-[11px] text-fs-muted">
            {filtersActive
              ? "无匹配事件，请调整筛选条件"
              : `该时段无事件${isAdmin ? "，可点击「新建」添加" : ""}`}
          </p>
        ) : (
          <EventTimelineView
            key={`${listUrl}-${filters.minImportance}-${filters.typeFamilies.join(",")}`}
            events={
              displayModel.hasEraStructure
                ? timelineVisibleEvents(displayModel)
                : filteredEvents
            }
            compact={compact}
            isAdmin={isAdmin}
            highlightedId={eventTracking ? highlightedId : null}
            rowRef={(id, el) => {
              if (el) rowRefs.current.set(id, el);
              else rowRefs.current.delete(id);
            }}
            onEdit={(e) => {
              if (isSecDerivedEvent(e)) return;
              setEditEvent(e);
              setFormOpen(true);
            }}
            onDelete={onDelete}
          />
        )}
      </div>
      <EventFormModal
        open={formOpen}
        title={editEvent ? "编辑事件" : "新建事件"}
        initial={formInitial}
        editId={editEvent?.id ?? null}
        onClose={() => {
          setFormOpen(false);
          setEditEvent(null);
        }}
        onSaved={() => void load()}
      />
    </section>
  );
}
