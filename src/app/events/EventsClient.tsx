"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventImportance, MarketEventDto } from "@/lib/data/marketEvents";
import { EVENT_IMPORTANCE_LABELS } from "@/lib/data/marketEvents";
import { MACRO_COUNTRIES } from "@/lib/data/macroCatalog";
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
import { EventDetailDrawer } from "@/components/events/EventDetailDrawer";
import { HorizontalHistoryTimeline } from "@/components/events/horizontal-timeline/HorizontalHistoryTimeline";
import {
  applyTimelineFilters,
  DEFAULT_TIMELINE_FILTERS,
  hasActiveTimelineFilters,
  TIMELINE_FILTER_EVENT_TYPES,
  toggleFilterItem,
  type TimelineFilterState,
} from "@/components/events/horizontal-timeline/timelineFilters";
import { MobileEventTimeline } from "@/components/events/mobile/MobileEventTimeline";
import { MobileSheet } from "@/components/mobile/MobileSheet";
import { IconFilter } from "@/components/mobile/mobileIcons";
import {
  buildEventTimeline,
  isEraHeaderEvent,
} from "@/lib/data/marketEventTimeline";
import { ProPaywall } from "@/components/billing/ProPaywall";
import { useIsMobile } from "@/hooks/useIsMobile";

type EventsView = "timeline" | "list";
type MobileEventsView = "vertical" | "horizontal";

function sortEventsAsc(events: MarketEventDto[]): MarketEventDto[] {
  return [...events].sort((a, b) => {
    const diff = Date.parse(a.occurredAt.slice(0, 10)) - Date.parse(b.occurredAt.slice(0, 10));
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

function eventMatchesQuery(
  event: MarketEventDto,
  q: string,
  country: string,
  importance: EventImportance | "",
): boolean {
  const query = q.trim().toLowerCase();
  if (query) {
    const hit =
      event.title?.toLowerCase().includes(query) ||
      event.content.toLowerCase().includes(query);
    if (!hit) return false;
  }
  if (country && !event.countries.includes(country)) return false;
  if (importance && event.importance !== importance) return false;
  return true;
}

function viewToggleClass(active: boolean) {
  return `rounded border px-2.5 py-1 text-[11px] transition ${
    active
      ? "border-fs-accent/40 bg-fs-accent-soft text-fs-accent-text"
      : "border-fs-border bg-white/95 text-fs-secondary hover:bg-fs-elevated"
  }`;
}

function mobileChipClass(active: boolean) {
  return `h-9 rounded-full border px-3.5 text-sm transition ${
    active
      ? "border-fs-accent/30 bg-fs-accent-soft font-medium text-fs-accent-text"
      : "border-fs-border bg-white text-fs-text"
  }`;
}

export function EventsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: EventsView = searchParams.get("view") === "list" ? "list" : "timeline";
  const isMobile = useIsMobile();
  /** 手机默认竖向时间线；`?view=timeline` 为横轴画布 */
  const mobileView: MobileEventsView =
    searchParams.get("view") === "timeline" ? "horizontal" : "vertical";

  const [events, setEvents] = useState<MarketEventDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [country, setCountry] = useState("US");
  const [importance, setImportance] = useState<EventImportance | "">("");
  const [formOpen, setFormOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<MarketEventDto | null>(null);
  const [mobileFilters, setMobileFilters] = useState<TimelineFilterState>(DEFAULT_TIMELINE_FILTERS);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileDetailEvent, setMobileDetailEvent] = useState<MarketEventDto | null>(null);

  const setView = useCallback(
    (next: EventsView) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next === "list") sp.set("view", "list");
      else sp.delete("view");
      const qs = sp.toString();
      router.push(qs ? `/events?${qs}` : "/events");
    },
    [router, searchParams],
  );

  const setMobileView = useCallback(
    (next: MobileEventsView) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next === "horizontal") sp.set("view", "timeline");
      else sp.delete("view");
      const qs = sp.toString();
      router.replace(qs ? `/events?${qs}` : "/events", { scroll: false });
    },
    [router, searchParams],
  );

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ limit: "2000" });
      const r = await fetch(`/api/events?${sp.toString()}`, { cache: "no-store" });
      if (r.status === 401) {
        setError("请先登录后查看时间线");
        setEvents([]);
        setTotal(0);
        return;
      }
      if (r.status === 403) {
        setError("NEEDS_PRO");
        setEvents([]);
        setTotal(0);
        return;
      }
      const j = (await r.json()) as { events?: MarketEventDto[]; total?: number; error?: string };
      if (!r.ok) throw new Error(j.error ?? "加载失败");
      setEvents(sortEventsAsc(j.events ?? []));
      setTotal(j.total ?? j.events?.length ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      if (country) sp.set("countries", country);
      if (importance) sp.set("importance", importance);
      sp.set("limit", "2000");
      const r = await fetch(`/api/events?${sp.toString()}`, { cache: "no-store" });
      if (r.status === 401) {
        setError("请先登录后查看时间线");
        setEvents([]);
        setTotal(0);
        return;
      }
      if (r.status === 403) {
        setError("NEEDS_PRO");
        setEvents([]);
        setTotal(0);
        return;
      }
      const j = (await r.json()) as {
        events?: MarketEventDto[];
        total?: number;
        error?: string;
      };
      if (!r.ok) throw new Error(j.error ?? "加载失败");
      setEvents(sortEventsAsc(j.events ?? []));
      setTotal(j.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [q, from, to, country, importance]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { user?: { role?: string } }) : null))
      .then((j) => setIsAdmin(j?.user?.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  // 手机端两种视图都在客户端筛选，始终拉取完整时间线
  const loadsFullTimeline = isMobile || view === "timeline";
  useEffect(() => {
    if (loadsFullTimeline) void loadTimeline();
    else void loadList();
  }, [loadsFullTimeline, loadTimeline, loadList]);

  const filtersActive = Boolean(q.trim() || from || to || importance);
  const timelineModel = useMemo(() => buildEventTimeline(events), [events]);
  const displayModel = useMemo(() => {
    if (!filtersActive) return timelineModel;
    return filterTimelineGroups(timelineModel, (e) =>
      eventMatchesQuery(e, q, country, importance),
    );
  }, [timelineModel, filtersActive, q, country, importance]);
  const visibleEvents = useMemo(
    () =>
      displayModel.hasEraStructure
        ? timelineVisibleEvents(displayModel)
        : events.filter((e) => eventMatchesQuery(e, q, country, importance)),
    [displayModel, events, q, country, importance],
  );
  const mobileVisibleEvents = useMemo(
    () => applyTimelineFilters(events, mobileFilters),
    [events, mobileFilters],
  );
  const hasVisible =
    displayModel.hasEraStructure
      ? displayModel.groups.length > 0 || displayModel.orphans.length > 0
      : visibleEvents.filter((e) => !isEraHeaderEvent(e)).length > 0;

  const onDelete = async (id: string) => {
    if (!window.confirm("确定删除？")) return;
    const r = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      window.alert(j.error ?? "删除失败");
      return;
    }
    if (view === "timeline") void loadTimeline();
    else void loadList();
  };

  if (isMobile) {
    const patchMobileFilters = (p: Partial<TimelineFilterState>) =>
      setMobileFilters((prev) => ({ ...prev, ...p }));
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-13 shrink-0 items-center gap-2 border-b border-fs-border py-1 pl-3 pr-1">
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-fs-text">历史时间线</h1>
          <div className="flex shrink-0 gap-0.5 rounded-lg border border-fs-border bg-fs-elevated p-0.5">
            {(["vertical", "horizontal"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={mobileView === v}
                onClick={() => setMobileView(v)}
                className={`h-8 rounded-md px-3 text-[13px] font-medium transition ${
                  mobileView === v
                    ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
                    : "text-fs-secondary"
                }`}
              >
                {v === "vertical" ? "纵向" : "横轴"}
              </button>
            ))}
          </div>
          {mobileView === "vertical" ? (
            <button
              type="button"
              onClick={() => setMobileFilterOpen(true)}
              aria-label="筛选事件"
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fs-secondary active:bg-fs-elevated"
            >
              <IconFilter size={22} />
              {hasActiveTimelineFilters(mobileFilters) ? (
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-fs-accent" />
              ) : null}
            </button>
          ) : (
            <span className="w-2 shrink-0" aria-hidden />
          )}
        </div>

        {error === "NEEDS_PRO" ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <ProPaywall
              title="事件时间线需要 Pro"
              description="深度浏览历史市场事件时间线需开通 Pro 或处于试用期。"
            />
          </div>
        ) : error ? (
          <p className="m-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : loading ? (
          <p className="flex flex-1 items-center justify-center text-sm text-fs-muted">
            加载时间线数据…
          </p>
        ) : mobileView === "vertical" ? (
          <MobileEventTimeline events={mobileVisibleEvents} onSelect={setMobileDetailEvent} />
        ) : (
          <div className="min-h-0 flex-1">
            <HorizontalHistoryTimeline events={events} />
          </div>
        )}

        <EventDetailDrawer event={mobileDetailEvent} onClose={() => setMobileDetailEvent(null)} />

        <MobileSheet
          open={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          title="筛选事件"
          footer={
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setMobileFilters({ ...DEFAULT_TIMELINE_FILTERS })}
                className="h-11 flex-1 rounded-lg border border-fs-border text-base text-fs-text"
              >
                重置
              </button>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="h-11 flex-[2] rounded-lg border border-fs-accent/30 bg-fs-accent-soft text-base font-medium text-fs-accent-text"
              >
                完成
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-5 px-4 pb-4 pt-2">
            <label className="block">
              <span className="mb-1.5 block text-[13px] text-fs-muted">国家</span>
              <select
                value={mobileFilters.country}
                onChange={(e) => patchMobileFilters({ country: e.target.value })}
                className="h-11 w-full rounded-lg border border-fs-border bg-white px-3 text-fs-text"
              >
                {MACRO_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}（{c.code}）
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend className="mb-1.5 text-[13px] text-fs-muted">重要性（不选表示全部）</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(EVENT_IMPORTANCE_LABELS) as EventImportance[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      patchMobileFilters({
                        importances: toggleFilterItem(mobileFilters.importances, k),
                      })
                    }
                    className={mobileChipClass(mobileFilters.importances.includes(k))}
                  >
                    {EVENT_IMPORTANCE_LABELS[k]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-[13px] text-fs-muted">事件类型（不选表示全部）</legend>
              <div className="flex flex-wrap gap-2">
                {TIMELINE_FILTER_EVENT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      patchMobileFilters({
                        eventTypes: toggleFilterItem(mobileFilters.eventTypes, t),
                      })
                    }
                    className={mobileChipClass(mobileFilters.eventTypes.includes(t))}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </MobileSheet>
      </div>
    );
  }

  if (view === "timeline") {
    return (
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="pointer-events-none absolute left-3 top-3 z-[60] flex items-center gap-1.5">
          <div className="pointer-events-auto flex rounded-lg border border-fs-border bg-white/95 p-0.5 shadow-sm backdrop-blur">
            <button type="button" className={viewToggleClass(true)} aria-current="page">
              横轴
            </button>
            <button
              type="button"
              className={viewToggleClass(false)}
              onClick={() => setView("list")}
            >
              列表
            </button>
          </div>
        </div>

        {error === "NEEDS_PRO" ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <ProPaywall
              title="事件时间线需要 Pro"
              description="深度浏览历史市场事件时间线需开通 Pro 或处于试用期。"
            />
          </div>
        ) : error ? (
          <p className="m-4 rounded border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : loading ? (
          <p className="flex flex-1 items-center justify-center text-sm text-fs-muted">
            加载时间线数据…
          </p>
        ) : (
          <div className="min-h-0 flex-1">
            <HorizontalHistoryTimeline events={events} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-3 overflow-y-auto px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fs-text">历史时间线 · 列表</h1>
          <p className="text-xs text-fs-muted">
            美国历史经济时代（1776—今）：按时代折叠浏览，悬停预览、点击查看详情。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-fs-border bg-fs-bg p-0.5">
            <button type="button" className={viewToggleClass(false)} onClick={() => setView("timeline")}>
              横轴
            </button>
            <button type="button" className={viewToggleClass(true)} aria-current="page">
              列表
            </button>
          </div>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                setEditEvent(null);
                setFormOpen(true);
              }}
              className="rounded border border-fs-accent/40 bg-fs-accent-soft px-3 py-1.5 text-xs text-fs-accent-text hover:border-fs-accent"
            >
              新建事件
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border border-fs-border bg-fs-elevated p-2 text-[11px]">
        <label className="text-fs-muted">
          搜索
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ml-1 rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
            placeholder="标题或内容"
          />
        </label>
        <label className="text-fs-muted">
          起
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="ml-1 rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
          />
        </label>
        <label className="text-fs-muted">
          止
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="ml-1 rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
          />
        </label>
        <label className="text-fs-muted">
          国家
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="ml-1 rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
          >
            <option value="">全部</option>
            {MACRO_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-fs-muted">
          重要性
          <select
            value={importance}
            onChange={(e) => setImportance(e.target.value as EventImportance | "")}
            className="ml-1 rounded border border-fs-border bg-fs-elevated px-2 py-1 text-fs-text"
          >
            <option value="">全部</option>
            {(Object.keys(EVENT_IMPORTANCE_LABELS) as EventImportance[]).map((k) => (
              <option key={k} value={k}>
                {EVENT_IMPORTANCE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void loadList()}
          className="self-end rounded border border-fs-border px-2 py-1 text-fs-secondary hover:bg-fs-elevated"
        >
          筛选
        </button>
      </div>

      {error === "NEEDS_PRO" ? (
        <ProPaywall
          title="事件时间线需要 Pro"
          description="深度浏览历史市场事件时间线需开通 Pro 或处于试用期。"
        />
      ) : error ? (
        <p className="rounded border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="min-h-[16rem] flex-1 overflow-y-auto rounded-lg border border-fs-border bg-fs-bg/40 px-3 py-3">
        {loading ? (
          <p className="p-6 text-center text-sm text-fs-muted">加载中…</p>
        ) : !hasVisible ? (
          <p className="p-6 text-center text-sm text-fs-muted">暂无匹配事件</p>
        ) : (
          <EventTimelineView
            key={`${q}-${from}-${to}-${country}-${importance}`}
            events={visibleEvents}
            isAdmin={isAdmin}
            onEdit={(e) => {
              setEditEvent(e);
              setFormOpen(true);
            }}
            onDelete={onDelete}
          />
        )}
      </div>
      <p className="text-[10px] text-fs-secondary">
        共 {total} 条
        {timelineModel.hasEraStructure ? ` · ${timelineModel.groups.length} 个时代阶段` : ""}
      </p>

      <EventFormModal
        open={formOpen}
        title={editEvent ? "编辑事件" : "新建事件"}
        initial={editEvent ? eventToFormValues(editEvent) : emptyEventForm()}
        editId={editEvent?.id ?? null}
        onClose={() => {
          setFormOpen(false);
          setEditEvent(null);
        }}
        onSaved={() => void loadList()}
      />
    </div>
  );
}
