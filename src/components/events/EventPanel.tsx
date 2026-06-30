"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
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

const TRACKING_STORAGE_KEY = "event-panel-tracking-v1";

export type EventPanelProps = {
  /** 底部时间轴可见区间起点 YYYY-MM-DD */
  rangeFrom?: string | null;
  /** 底部时间轴可见区间终点 YYYY-MM-DD */
  rangeTo?: string | null;
  /** 图表十字线当前日期 YYYY-MM-DD（事件追踪用） */
  trackDate?: string | null;
  /** 兼容：无 range 时仍可按上下文 ±N 天加载 */
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
  if (props.contextCountries?.length) sp.set("countries", props.contextCountries.join(","));
  if (props.contextIndustries?.length) sp.set("industries", props.contextIndustries.join(","));
  if (props.contextAssets?.length) sp.set("assets", props.contextAssets.join(","));
  if (props.contextMacroKeys?.length) sp.set("macroKeys", props.contextMacroKeys.join(","));
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

function findNearestEventId(events: MarketEventDto[], trackDate: string): string | null {
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

function eventMatchesFilters(
  event: MarketEventDto,
  filters: EventPanelFilterState,
): boolean {
  const q = filters.searchQ.trim().toLowerCase();
  if (q) {
    const hit =
      event.title?.toLowerCase().includes(q) ||
      event.content.toLowerCase().includes(q);
    if (!hit) return false;
  }
  if (filters.importance && event.importance !== filters.importance) return false;
  if (filters.eventType && event.eventType !== filters.eventType) return false;
  if (filters.countries.length) {
    if (!filters.countries.some((c) => event.countries.includes(c))) return false;
  }
  if (filters.industries.length) {
    if (!filters.industries.some((ind) => event.industries.includes(ind))) return false;
  }
  if (filters.assets.length) {
    const want = new Set(filters.assets.map((a) => a.toUpperCase()));
    if (!event.assets.some((a) => want.has(a.toUpperCase()))) return false;
  }
  return true;
}

function filterEvents(events: MarketEventDto[], filters: EventPanelFilterState): MarketEventDto[] {
  return events.filter((e) => eventMatchesFilters(e, filters));
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
  const [filters, setFilters] = useState<EventPanelFilterState>(EMPTY_EVENT_PANEL_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const lastScrolledTrackDateRef = useRef<string | null>(null);

  const useRangeMode = Boolean(rangeFrom && rangeTo);

  const eventTracking = eventTrackingProp ?? trackingInternal;

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

  const listUrl = useMemo(() => {
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

  const sortedEvents = useMemo(() => sortEventsAsc(events), [events]);
  const filtersActive = hasActiveEventPanelFilters(filters);
  const timelineModel = useMemo(() => buildEventTimeline(sortedEvents), [sortedEvents]);
  const filteredEvents = useMemo(
    () => filterEvents(sortedEvents, filters),
    [sortedEvents, filters],
  );
  const displayModel = useMemo(() => {
    if (!filtersActive) return timelineModel;
    return filterTimelineGroups(timelineModel, (e) => eventMatchesFilters(e, filters));
  }, [timelineModel, filters, filtersActive]);
  const trackingEvents = useMemo(
    () =>
      filtersActive
        ? filteredEvents.filter((ev) => !isEraHeaderEvent(ev))
        : timelineVisibleEvents(displayModel).filter((ev) => !isEraHeaderEvent(ev)),
    [filtersActive, filteredEvents, displayModel],
  );
  const hasVisibleTimeline =
    displayModel.hasEraStructure
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
                className="h-3 w-3 shrink-0 rounded border-fs-border accent-cyan-600"
                aria-label="事件追踪：十字线移动时滚动到最近事件"
              />
              事件追踪
            </label>
            <div className="min-w-0 flex-1">
              {!embedded ? (
                <h3 className="text-[11px] font-semibold text-fs-text">事件记录</h3>
              ) : null}
              <p className={`truncate text-[10px] text-fs-muted ${embedded ? "" : "mt-0"}`}>
                {rangeHint}
                {eventTracking ? (
                  <span className="ml-1 text-[9px] text-cyan-500/80">· 十字线联动</span>
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
          expanded={filtersExpanded}
          onToggleExpanded={() => setFiltersExpanded((v) => !v)}
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
          <p className="py-4 text-center text-[11px] text-rose-300">{error}</p>
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
            key={`${listUrl}-${filters.searchQ}-${filters.importance}-${filters.eventType}`}
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
