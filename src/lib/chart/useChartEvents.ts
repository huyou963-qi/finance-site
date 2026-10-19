"use client";
import { useEffect, useMemo, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { ALL_EVENT_TYPE_FAMILY_IDS } from "@/lib/data/eventTaxonomy";
import { milestoneToMarketEventDto, type CompanyMilestone } from "@/lib/equity/companyMilestones";
import { buildForChartUrl } from "./buildForChartUrl";
import { mergeChartEvents, eventPassesContentFilters, eventDisplayColor } from "./eventSelection";
import type { EventViewFilterState } from "./eventViewFilters";

/** One query/result for the shelf, details and chart. Presentation changes never refetch facts. */
export function useChartEvents(symbol: string, local: CompanyMilestone[], filters: EventViewFilterState, fromSec: number | null, toSec: number | null) {
  const [remote, setRemote] = useState<MarketEventDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const from = fromSec == null ? "2000-01-01" : new Date(Math.min(fromSec, toSec ?? fromSec) * 1000).toISOString().slice(0, 10);
  const to = toSec == null ? new Date().toISOString().slice(0, 10) : new Date(Math.max(toSec, fromSec ?? toSec) * 1000).toISOString().slice(0, 10);
  const url = symbol ? buildForChartUrl(symbol, from, to, { ...filters, minImportance: "LOW", typeFamilies: [...ALL_EVENT_TYPE_FAMILY_IDS], largeSurpriseOnly: false }) : "";
  useEffect(() => {
    const abort = new AbortController();
    setRemote([]); setError(null);
    if (!url) { setLoading(false); return; }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const collected: MarketEventDto[] = [];
        let offset = 0, more = true;
        while (more) {
          const r = await fetch(`${url}&offset=${offset}`, { signal: abort.signal, cache: "no-store" });
          if (!r.ok) throw new Error("共享事件加载失败，本地事件仍可查看");
          const body = await r.json() as { events?: MarketEventDto[]; hasMore?: boolean };
          collected.push(...(body.events ?? []));
          more = body.hasMore === true; offset += 2000;
        }
        if (!abort.signal.aborted) setRemote(collected);
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "事件加载失败"); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }, 200);
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [url]);
  const merged = useMemo(() => mergeChartEvents(local.map(milestoneToMarketEventDto), remote, filters.includeLocal !== false), [local, remote, filters.includeLocal]);
  const inRange = useMemo(() => merged.filter(e => e.occurredAt.slice(0, 10) >= from && e.occurredAt.slice(0, 10) <= to), [merged, from, to]);
  const events = useMemo(() => inRange.filter(e => eventPassesContentFilters(e, filters)).map(e => ({ ...e, color: eventDisplayColor(e, filters) })), [inRange, filters]);
  return { events, loaded: merged.length, inRange: inRange.length, filteredOut: inRange.length - events.length, loading, error };
}
