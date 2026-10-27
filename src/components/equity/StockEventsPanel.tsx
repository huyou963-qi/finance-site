"use client";

/**
 * 个股「事件与叙事」面板（Phase 3 / P10-A4）：
 * SEC filings 时间线（按月分组 + 类型 badge + 业绩 metrics 内嵌）+ 经营叙事卡区。
 */

import { useEffect, useMemo, useState } from "react";
import type { StockEvent } from "@/lib/equity/stockEvents";
import { groupStockEvents, type StockEventGroup } from "@/lib/equity/stockEventGroups";
import type { StockDisclosureHealth as Health } from "@/lib/equity/disclosureHealthPolicy";
import { StockEventGroupRow } from "./StockEventGroupRow";
import { StockDisclosureHealth } from "./StockDisclosureHealth";

type Brief = {
  id: string;
  symbol: string;
  periodMonth: string;
  bodyMarkdown?: string;
  meta?: { title?: string } | null;
};

const TYPE_FILTERS: { id: StockEvent["type"]; labelZh: string }[] = [
  { id: "earnings", labelZh: "季报" },
  { id: "annual", labelZh: "年报" },
  { id: "8k", labelZh: "8-K" },
  { id: "split", labelZh: "拆股" },
  { id: "insider-plan", labelZh: "内部人计划" },
];

function monthLabel(iso: string): string {
  return `${iso.slice(0, 4)} 年 ${Number(iso.slice(5, 7))} 月`;
}

export function StockEventsPanel({ symbol }: { symbol: string }) {
  const [events, setEvents] = useState<StockEvent[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<StockEvent["type"]>>(
    new Set(["earnings", "annual", "8k", "split", "insider-plan"]),
  );
  const [majorOnly, setMajorOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHealth(null);
    Promise.all([
      fetch(`/api/equity/stocks/${encodeURIComponent(symbol)}/events?limit=120&details=1`, {
        cache: "no-store",
      }).then(async (r) => {
        const j = (await r.json()) as { error?: string; events?: StockEvent[]; sync?: Health };
        if (!r.ok) throw new Error(j.error ?? "事件加载失败");
        return { events: j.events ?? [], health: j.sync ?? null };
      }),
      fetch(`/api/equity/company-operating-briefs?symbol=${encodeURIComponent(symbol)}&limit=6`, {
        cache: "no-store",
      })
        .then(async (r) => {
          if (!r.ok) return [];
          const j = (await r.json()) as { briefs?: Brief[] };
          return j.briefs ?? [];
        })
        .catch(() => [] as Brief[]),
    ])
      .then(([ev, br]) => {
        if (cancelled) return;
        setEvents(ev.events);
        setHealth(ev.health);
        setBriefs(br);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const visible = useMemo(
    () =>
      events.filter((e) => {
        if (!activeTypes.has(e.type)) return false;
        if (majorOnly && e.type === "8k" && e.importance === "low") return false;
        return true;
      }),
    [events, activeTypes, majorOnly],
  );

  const byMonth = useMemo(() => {
    const groups: { month: string; rows: StockEventGroup[] }[] = [];
    for (const e of groupStockEvents(visible)) {
      const m = e.date.slice(0, 7);
      const last = groups[groups.length - 1];
      if (last && last.month === m) last.rows.push(e);
      else groups.push({ month: m, rows: [e] });
    }
    return groups;
  }, [visible]);

  const toggleType = (t: StockEvent["type"]) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  return (
    <section className="min-w-0 rounded-md border border-fs-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-fs-border bg-fs-elevated/40 px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-fs-text">事件与叙事</span>
          <span className="text-xs text-fs-muted">每日批量更新 · 精确时刻按美东</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleType(t.id)}
              aria-pressed={activeTypes.has(t.id)}
              className={`rounded px-2 py-0.5 transition-colors ${
                activeTypes.has(t.id)
                  ? "bg-fs-accent/20 text-fs-accent-text"
                  : "text-fs-muted hover:text-fs-text"
              }`}
            >
              {t.labelZh}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMajorOnly((v) => !v)}
            aria-pressed={majorOnly}
            className={`ml-1 rounded px-2 py-0.5 transition-colors ${
              majorOnly ? "bg-amber-500/20 text-amber-800" : "text-fs-muted hover:text-fs-text"
            }`}
          >
            仅重大
          </button>
        </div>
      </div>

      <StockDisclosureHealth health={health} />

      {error ? <div className="px-3 py-3 text-sm text-red-300">{error}</div> : null}

      {loading ? (
        <div className="flex h-24 items-center justify-center text-sm text-fs-muted">加载中…</div>
      ) : byMonth.length === 0 ? (
        <div className="px-3 py-4 text-sm text-fs-muted">
          {events.length ? "当前筛选条件下暂无事件。" : "暂无已入库事件，请结合上方每日更新状态判断数据是否齐全。"}
        </div>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto px-3 py-2">
          {byMonth.map((g) => (
            <div key={g.month} className="mb-2">
              <div className="sticky top-0 bg-fs-bg/95 py-1 text-[11px] font-medium text-fs-muted">
                {monthLabel(g.rows[0]!.date)}
              </div>
              <ul className="flex flex-col gap-1">
                {g.rows.map(group => <StockEventGroupRow key={group.key} group={group} />)}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-fs-border px-3 py-2">
        <div className="text-xs font-medium text-fs-muted">经营叙事</div>
        {briefs.length ? (
          <ul className="mt-1 flex flex-col gap-2">
            {briefs.map((b) => (
              <li key={b.id} className="rounded border border-fs-border/60 bg-fs-elevated/30 p-2">
                <div className="text-xs text-fs-muted">
                  {b.periodMonth}
                  {b.meta?.title ? ` · ${b.meta.title}` : ""}
                </div>
                {b.bodyMarkdown ? (
                  <div className="mt-1 whitespace-pre-wrap text-sm text-fs-text">
                    {b.bodyMarkdown.slice(0, 600)}
                    {b.bodyMarkdown.length > 600 ? "…" : ""}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-fs-muted">经营叙事由外部 ingest 提供，尚未接入。</p>
        )}
      </div>
    </section>
  );
}
