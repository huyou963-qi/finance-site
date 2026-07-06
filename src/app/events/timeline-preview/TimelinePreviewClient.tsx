"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { HorizontalHistoryTimeline } from "@/components/events/horizontal-timeline/HorizontalHistoryTimeline";

function sortEventsAsc(events: MarketEventDto[]): MarketEventDto[] {
  return [...events].sort((a, b) => {
    const diff = Date.parse(a.occurredAt.slice(0, 10)) - Date.parse(b.occurredAt.slice(0, 10));
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}

export function TimelinePreviewClient() {
  const [events, setEvents] = useState<MarketEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams({ limit: "2000" });
      const r = await fetch(`/api/events?${sp.toString()}`, { cache: "no-store" });
      if (r.status === 401) {
        setError("请先登录后查看时间轴预览");
        setEvents([]);
        return;
      }
      const j = (await r.json()) as { events?: MarketEventDto[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? "加载失败");
      setEvents(sortEventsAsc(j.events ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {error ? (
        <p className="m-4 rounded border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : loading ? (
        <p className="flex flex-1 items-center justify-center text-sm text-fs-muted">加载事件数据…</p>
      ) : (
        <div className="relative min-h-0 flex-1">
          <Link
            href="/events"
            className="absolute left-3 top-3 z-[60] rounded border border-fs-border bg-white/95 px-2.5 py-1 text-[11px] text-fs-secondary shadow-sm backdrop-blur hover:bg-fs-elevated"
          >
            ← 列表
          </Link>
          <HorizontalHistoryTimeline events={events} />
        </div>
      )}
    </div>
  );
}
