"use client";

/**
 * 个股「事件与叙事」面板（Phase 3 / P10-A4）：
 * SEC filings 时间线（按月分组 + 类型 badge + 业绩 metrics 内嵌）+ 经营叙事卡区。
 */

import { useEffect, useMemo, useState } from "react";

type EventMetrics = {
  period: string;
  fiscalQuarter: number | null;
  revenue: number | null;
  revenueYoY: number | null;
  eps: number | null;
  epsYoY: number | null;
};

type StockEvent = {
  type: "earnings" | "annual" | "8k" | "split";
  date: string;
  titleZh: string;
  form: string | null;
  items: string[];
  importance: "high" | "medium" | "low";
  url: string | null;
  metrics: EventMetrics | null;
  splitRatio: string | null;
  reaction: number | null;
};

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
];

function badgeClass(e: StockEvent): string {
  if (e.type === "earnings") return "bg-blue-500/15 text-blue-400";
  if (e.type === "annual") return "bg-indigo-500/20 text-indigo-400";
  if (e.type === "split") return "bg-purple-500/15 text-purple-400";
  return e.importance === "high"
    ? "bg-amber-500/15 text-amber-400"
    : "bg-fs-elevated text-fs-muted";
}

function badgeText(e: StockEvent): string {
  if (e.type === "earnings") return e.form ?? "10-Q";
  if (e.type === "annual") return e.form ?? "10-K";
  if (e.type === "split") return "拆股";
  return e.items.length ? `8-K ${e.items.join(",")}` : "8-K";
}

function fmtRevenue(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  return `${(v / 1e6).toFixed(0)}M`;
}

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function pctClass(v: number | null): string {
  if (v == null) return "text-fs-muted";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-fs-muted";
}

function monthLabel(iso: string): string {
  return `${iso.slice(0, 4)} 年 ${Number(iso.slice(5, 7))} 月`;
}

export function StockEventsPanel({ symbol }: { symbol: string }) {
  const [events, setEvents] = useState<StockEvent[]>([]);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTypes, setActiveTypes] = useState<Set<StockEvent["type"]>>(
    new Set(["earnings", "annual", "8k", "split"]),
  );
  const [majorOnly, setMajorOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/equity/stocks/${encodeURIComponent(symbol)}/events?limit=120`, {
        cache: "no-store",
      }).then(async (r) => {
        const j = (await r.json()) as { error?: string; events?: StockEvent[] };
        if (!r.ok) throw new Error(j.error ?? "事件加载失败");
        return j.events ?? [];
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
        setEvents(ev);
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
    const groups: { month: string; rows: StockEvent[] }[] = [];
    for (const e of visible) {
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
    <section className="rounded-md border border-fs-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-fs-border bg-fs-elevated/40 px-3 py-2">
        <span className="text-sm font-medium text-fs-text">事件与叙事</span>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleType(t.id)}
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
            className={`ml-1 rounded px-2 py-0.5 transition-colors ${
              majorOnly ? "bg-amber-500/20 text-amber-400" : "text-fs-muted hover:text-fs-text"
            }`}
          >
            仅重大
          </button>
        </div>
      </div>

      {error ? <div className="px-3 py-3 text-sm text-red-300">{error}</div> : null}

      {loading ? (
        <div className="flex h-24 items-center justify-center text-sm text-fs-muted">加载中…</div>
      ) : byMonth.length === 0 ? (
        <div className="px-3 py-4 text-sm text-fs-muted">
          暂无事件。SEC filings 会在访问时自动回补；批量同步：npm run equity:sync-sec
        </div>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto px-3 py-2">
          {byMonth.map((g) => (
            <div key={g.month} className="mb-2">
              <div className="sticky top-0 bg-fs-bg/95 py-1 text-[11px] font-medium text-fs-muted">
                {monthLabel(g.rows[0]!.date)}
              </div>
              <ul className="flex flex-col gap-1">
                {g.rows.map((e, i) => (
                  <li
                    key={`${e.date}-${e.type}-${i}`}
                    className="flex flex-wrap items-baseline gap-2 rounded px-2 py-1.5 hover:bg-fs-elevated/40"
                  >
                    <span className="w-20 shrink-0 tabular-nums text-xs text-fs-muted">
                      {e.date}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass(e)}`}
                    >
                      {badgeText(e)}
                    </span>
                    {e.url ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-fs-text hover:text-fs-accent-text hover:underline"
                      >
                        {e.titleZh}
                      </a>
                    ) : (
                      <span className="text-sm text-fs-text">{e.titleZh}</span>
                    )}
                    {e.metrics ? (
                      <span className="flex flex-wrap items-baseline gap-2 text-xs">
                        <span className="text-fs-muted">{e.metrics.period}</span>
                        <span className="text-fs-text">营收 {fmtRevenue(e.metrics.revenue)}</span>
                        <span className={pctClass(e.metrics.revenueYoY)}>
                          {fmtPct(e.metrics.revenueYoY)}
                        </span>
                        {e.metrics.eps != null ? (
                          <span className="text-fs-text">
                            EPS {e.metrics.eps.toFixed(2)}
                            <span className={`ml-1 ${pctClass(e.metrics.epsYoY)}`}>
                              {fmtPct(e.metrics.epsYoY)}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {e.reaction != null ? (
                      <span className="text-xs text-fs-muted">
                        T+1 <span className={pctClass(e.reaction)}>{fmtPct(e.reaction)}</span>
                      </span>
                    ) : null}
                  </li>
                ))}
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
