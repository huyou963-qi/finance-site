"use client";

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
import {
  buildEventTimeline,
  isEraHeaderEvent,
} from "@/lib/data/marketEventTimeline";

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

export function EventsClient() {
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

  const load = useCallback(async () => {
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
        setError("请先登录后查看事件记录");
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

  useEffect(() => {
    void load();
  }, [load]);

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
    void load();
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-3 px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fs-text">事件记录器</h1>
          <p className="text-xs text-fs-muted">
            美国历史经济时代时间线（1776—今）：可折叠时代阶段与阶段内重要事件，支持 Wikipedia 延伸阅读。
          </p>
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
          onClick={() => void load()}
          className="self-end rounded border border-fs-border px-2 py-1 text-fs-secondary hover:bg-fs-elevated"
        >
          筛选
        </button>
      </div>

      {error ? (
        <p className="rounded border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-fs-border bg-fs-bg/40 px-3 py-3">
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
        {timelineModel.hasEraStructure
          ? ` · ${timelineModel.groups.length} 个时代阶段`
          : ""}
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
        onSaved={() => void load()}
      />
    </div>
  );
}
