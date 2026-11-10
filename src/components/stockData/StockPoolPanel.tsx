"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeUsTicker } from "@/lib/equity/stockData/request";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";
import type { WatchlistData } from "@/lib/data/marketWatchlist";

export type PickedStock = { symbol: string; name: string };

type Props = {
  /** 已在表格里的代码，列表里打勾 */
  inTable: ReadonlySet<string>;
  onAdd: (stocks: PickedStock[]) => void;
};

type PoolSummary = { id: string; label: string; count: number };

/** 只接受普通美股与 ETF；商品、外汇、债券收益率等不在本页范围 */
function isUsSearchResult(item: SymbolSearchItem): boolean {
  return !!normalizeUsTicker(item.symbol) && (!item.type || item.type === "ETF");
}

/**
 * 左下：股票来源。「自选股」与行情页共用同一份自选列表；「系统股票池」为标普 500 与 GICS 行业；
 * 底部搜索框按代码或名称查找美股。点一只加一只，「全部加入」加整组。
 */
export function StockPoolPanel({ inTable, onAdd }: Props) {
  const [tab, setTab] = useState<"watchlist" | "pools">("watchlist");

  // 自选股
  const [watch, setWatch] = useState<(WatchlistData & { userId: string | null }) | null>(null);
  const [watchError, setWatchError] = useState("");
  const [group, setGroup] = useState("all");
  const loadWatchlist = () =>
    fetch("/api/tools/market-watchlist", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then((j) => { setWatch(j); setWatchError(""); })
      .catch((e) => setWatchError(e.message || "无法加载自选股"));
  useEffect(() => { void loadWatchlist(); }, []);

  const watchStocks = useMemo(() => {
    const all = watch?.stocks ?? [];
    return group === "all" ? all : all.filter((s) => (s.groupId ?? "") === group);
  }, [watch, group]);

  // 系统股票池
  const [pools, setPools] = useState<PoolSummary[] | null>(null);
  const [poolId, setPoolId] = useState("");
  const [members, setMembers] = useState<PickedStock[] | null>(null);
  const [poolError, setPoolError] = useState("");
  useEffect(() => {
    if (tab !== "pools" || pools) return;
    fetch("/api/equity/stock-data/pools")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then((j) => { setPools(j.pools); setPoolId(j.pools[0]?.id ?? ""); })
      .catch((e) => setPoolError(e.message || "无法读取股票池"));
  }, [tab, pools]);
  useEffect(() => {
    if (!poolId) return;
    const abort = new AbortController();
    setMembers(null);
    fetch(`/api/equity/stock-data/pools?id=${encodeURIComponent(poolId)}`, { signal: abort.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then((j) => setMembers(j.members))
      .catch((e) => { if (!abort.signal.aborted) setPoolError(e.message || "无法读取股票池"); });
    return () => abort.abort();
  }, [poolId]);

  // 搜索
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const abort = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      fetch(`/api/data/symbol-search?q=${encodeURIComponent(q)}`, { signal: abort.signal })
        .then((r) => r.json())
        .then((j) => setResults((j.results ?? []).filter(isUsSearchResult).slice(0, 12)))
        .catch(() => { if (!abort.signal.aborted) setResults([]); })
        .finally(() => { if (!abort.signal.aborted) setSearching(false); });
    }, 250);
    return () => { clearTimeout(t); abort.abort(); };
  }, [query]);

  const [starring, setStarring] = useState("");
  const addToWatchlist = async (item: SymbolSearchItem) => {
    if (!watch?.userId) return;
    setStarring(item.symbol);
    try {
      const r = await fetch("/api/tools/market-watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: watch.userId, stock: { symbol: item.symbol, name: item.name, exchange: item.exchange }, groupId: null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setWatch(j);
    } catch (e) {
      setWatchError(e instanceof Error ? e.message : "无法加入自选");
    } finally {
      setStarring("");
    }
  };
  const watched = useMemo(() => new Set((watch?.stocks ?? []).map((s) => s.symbol)), [watch]);

  const tabNames = useMemo(() => {
    const groups = watch?.groups ?? [];
    const names = new Map<string, string>([["all", "全部"], ["", "未分组"], ...groups.map((g) => [g.id, g.name] as [string, string])]);
    const order = watch?.tabOrder ?? ["all", "", ...groups.map((g) => g.id)];
    return order.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! }));
  }, [watch]);

  const stockList = (list: PickedStock[]) => (
    <ul className="divide-y divide-fs-border">
      {list.map((s) => {
        const added = inTable.has(normalizeUsTicker(s.symbol) ?? s.symbol);
        return (
          <li key={s.symbol}>
            <button
              type="button"
              onClick={() => onAdd([s])}
              className="flex min-h-9 md:min-h-7 w-full items-center gap-2 px-3 text-left text-sm md:text-xs hover:bg-fs-elevated"
              title={added ? "已在表格中" : "加入表格"}
            >
              <span className="w-16 shrink-0 font-medium">{s.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-fs-muted">{s.name}</span>
              <span aria-hidden className={added ? "text-fs-accent" : "text-fs-muted"}>{added ? "✓" : "+"}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`min-h-9 md:min-h-7 px-3 text-sm md:text-xs ${tab === id ? "border-b-2 border-fs-accent font-semibold text-fs-text" : "text-fs-muted"}`}
    >
      {label}
    </button>
  );

  const current: PickedStock[] = tab === "watchlist" ? watchStocks : members ?? [];
  const select = "min-h-9 md:min-h-7 min-w-0 flex-1 rounded-lg border border-fs-border bg-fs-elevated px-2 text-sm md:text-xs";

  return (
    <section aria-label="股票" className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="股票来源" className="flex border-b border-fs-border px-1">
        {tabBtn("watchlist", "我的自选股")}
        {tabBtn("pools", "系统股票池")}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 md:py-1">
        {tab === "watchlist" ? (
          <select aria-label="自选分组" className={select} value={group} onChange={(e) => setGroup(e.target.value)}>
            {tabNames.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ) : (
          <select aria-label="系统股票池" className={select} value={poolId} onChange={(e) => setPoolId(e.target.value)} disabled={!pools}>
            {(pools ?? []).map((p) => <option key={p.id} value={p.id}>{p.label}（{p.count}）</option>)}
          </select>
        )}
        <button
          type="button"
          disabled={!current.length}
          onClick={() => onAdd(current)}
          className="min-h-9 md:min-h-7 shrink-0 rounded-lg border border-fs-border px-3 text-sm md:text-xs hover:bg-fs-elevated disabled:opacity-40"
        >
          全部加入
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "watchlist" ? (
          watchError ? <p className="px-3 py-4 text-sm md:text-xs text-fs-negative">{watchError}</p>
          : !watch ? <p className="px-3 py-4 text-sm md:text-xs text-fs-muted">正在加载自选股…</p>
          : !watchStocks.length ? <p className="px-3 py-4 text-sm md:text-xs text-fs-muted">这个分组还没有股票。可用下方搜索框添加，☆ 收藏进自选。</p>
          : stockList(watchStocks)
        ) : poolError ? <p className="px-3 py-4 text-sm md:text-xs text-fs-negative">{poolError}</p>
          : !members ? <p className="px-3 py-4 text-sm md:text-xs text-fs-muted">正在读取…</p>
          : stockList(members)}
      </div>

      <div className="relative border-t border-fs-border p-3">
        {query.trim() ? (
          <div className="absolute inset-x-3 bottom-full mb-1 max-h-72 overflow-y-auto rounded-lg border border-fs-border bg-fs-bg shadow-lg">
            {searching && !results.length ? <p className="px-3 py-3 text-sm md:text-xs text-fs-muted">搜索中…</p>
              : !results.length ? <p className="px-3 py-3 text-sm md:text-xs text-fs-muted">没有找到美股，试试代码或英文名</p>
              : (
                <ul className="divide-y divide-fs-border">
                  {results.map((r) => (
                    <li key={r.symbol} className="flex items-center">
                      <button type="button" onClick={() => onAdd([{ symbol: r.symbol, name: r.name }])} className="flex min-h-10 md:min-h-8 min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm md:text-xs hover:bg-fs-elevated">
                        <span className="w-16 shrink-0 font-medium">{r.symbol}</span>
                        <span className="min-w-0 flex-1 truncate text-fs-muted">{r.name}</span>
                        {r.type === "ETF" ? <span className="text-xs text-fs-muted">ETF</span> : null}
                      </button>
                      {watch?.userId ? (
                        <button
                          type="button"
                          disabled={watched.has(r.symbol) || starring === r.symbol}
                          onClick={() => void addToWatchlist(r)}
                          aria-label={watched.has(r.symbol) ? `${r.symbol} 已在自选` : `把 ${r.symbol} 加入自选`}
                          title={watched.has(r.symbol) ? "已在自选" : "加入自选（未分组）"}
                          className="min-h-10 md:min-h-8 w-10 shrink-0 text-fs-accent disabled:text-fs-muted"
                        >
                          {watched.has(r.symbol) ? "★" : "☆"}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        ) : null}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) { onAdd([{ symbol: results[0].symbol, name: results[0].name }]); setQuery(""); }
            if (e.key === "Escape") setQuery("");
          }}
          placeholder="输入美股代码或名称，回车加入"
          aria-label="搜索股票"
          className="min-h-10 md:min-h-8 w-full rounded-lg border border-fs-border bg-fs-elevated px-3 text-sm md:text-xs"
        />
      </div>
    </section>
  );
}
