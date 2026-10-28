"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MarketEventDto } from "@/lib/data/marketEvents";
import { milestoneToMarketEventDto, type CompanyMilestone } from "@/lib/equity/companyMilestones";
import { buildChartCandidateUrl } from "./buildForChartUrl";
import { selectChartEvents } from "./eventSelection";
import type { EventViewFilterState } from "./eventViewFilters";

/** Loaded candidates, source lists and chart projection share one filtering/diagnostic pipeline. */
export function useChartEvents(symbol: string, local: CompanyMilestone[], filters: EventViewFilterState, fromSec: number | null, toSec: number | null) {
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; events: MarketEventDto[]; loading: boolean; error: string | null }>({ key: "", events: [], loading: false, error: null });
  const from = fromSec == null ? "2000-01-01" : new Date(Math.min(fromSec, toSec ?? fromSec) * 1000).toISOString().slice(0, 10);
  const to = toSec == null ? new Date().toISOString().slice(0, 10) : new Date(Math.max(toSec, fromSec ?? toSec) * 1000).toISOString().slice(0, 10);
  const url = symbol ? buildChartCandidateUrl(symbol, from, to, filters) : "";
  const key = `${url}:${attempt}`;
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    const abort = new AbortController();
    setResponse({ key, events: [], loading: Boolean(url), error: null });
    if (!url) return () => abort.abort();
    const timer = window.setTimeout(async () => {
      try {
        const collected = new Map<string, MarketEventDto>();
        let offset = 0, more = true;
        while (more) {
          const r = await fetch(`${url}&offset=${offset}`, { signal: abort.signal, cache: "no-store" });
          if (!r.ok) throw new Error("系统事件加载失败，当前覆盖情况未知；用户事件仍可查看");
          const body = await r.json() as { events?: MarketEventDto[]; hasMore?: boolean };
          // SEC records recur on each shared-library page; transport repeats are not extra facts.
          for (const event of body.events ?? []) collected.set(event.id, event);
          more = body.hasMore === true; offset += 2000;
        }
        if (!abort.signal.aborted) setResponse({ key, events: [...collected.values()], loading: false, error: null });
      } catch (e) {
        if (!abort.signal.aborted) setResponse({ key, events: [], loading: false, error: e instanceof Error ? e.message : "事件加载失败" });
      }
    }, 200);
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [url, key]);
  const selected = useMemo(() => selectChartEvents(local.map(milestoneToMarketEventDto), response.key === key ? response.events : [], filters, from, to), [local, response, key, filters, from, to]);
  return { ...selected, from, to, retry, loading: Boolean(url) && (response.key !== key || response.loading), error: response.key === key ? response.error : null };
}
