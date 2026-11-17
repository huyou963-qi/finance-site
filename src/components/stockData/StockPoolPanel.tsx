"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeUsTicker } from "@/lib/equity/stockData/request";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";
import type { WatchlistData } from "@/lib/data/marketWatchlist";
import { useTr } from "@/i18n/TextProvider";

export type PickedStock = { symbol: string; name: string };

type Props = {
  /** 已在表格里的代码，列表里打勾 */
  inTable: ReadonlySet<string>;
  onAdd: (stocks: PickedStock[]) => void;
  /** 表格还能再加几只（用于「前 N 只」） */
  remainingSlots?: number;
};

type PoolSummary = { id: string; label: string; count: number };

/** 只接受普通美股与 ETF；商品、外汇、债券收益率等不在本页范围 */
function isUsSearchResult(item: SymbolSearchItem): boolean {
  return !!normalizeUsTicker(item.symbol) && (!item.type || item.type === "ETF");
}

/**
 * 左下：股票来源。「自选股」与行情页共用同一份自选列表；「系统股票池」为标普 500 与 GICS 行业；
 * 底部搜索框按代码或名称查找美股。点一只加一只，「全部加入」/「前 N 只」加整组或前缀。
 */
export function StockPoolPanel({ inTable, onAdd, remainingSlots = 50 }: Props) {
  const tr = useTr();
  const [tab, setTab] = useState<"watchlist" | "pools">("watchlist");
  const [watchReady, setWatchReady] = useState(false);

  // 自选股
  const [watch, setWatch] = useState<(WatchlistData & { userId: string | null }) | null>(null);
  const [watchError, setWatchError] = useState("");
  const [group, setGroup] = useState("all");
  const loadWatchlist = () =>
    fetch("/api/tools/market-watchlist", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then((j) => { setWatch(j); setWatchError(""); })
      .catch((e) => setWatchError(e.message || tr("无法加载自选股")))
      .finally(() => setWatchReady(true));
  useEffect(() => { void loadWatchlist(); }, [tr]);

  // 自选为空时默认切到系统股票池，方便第一次使用
  useEffect(() => {
    if (!watchReady || !watch) return;
    if ((watch.stocks?.length ?? 0) === 0) setTab("pools");
  }, [watchReady, watch]);

  const watchStocks = useMemo(() => {
    const all = watch?.stocks ?? [];
    return group === "all" ? all : all.filter((s) => (s.groupId ?? "") === group);
  }, [watch, group]);

  // 系统股票池
  const [pools, setPools] = useState<PoolSummary[] | null>(null);
  const [poolId, setPoolId] = useState("");
  const [members, setMembers] = useState<PickedStock[] | null>(null);
  const [poolError, setPoolError] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  useEffect(() => {
    if (tab !== "pools" || pools) return;
    fetch("/api/equity/stock-data/pools")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then((j) => { setPools(j.pools); setPoolId(j.pools[0]?.id ?? ""); })
      .catch((e) => setPoolError(e.message || tr("无法读取股票池")));
  }, [tab, pools, tr]);
  useEffect(() => {
    if (!poolId) return;
    const abort = new AbortController();
    setMembers(null);
    setMemberFilter("");
    fetch(`/api/equity/stock-data/pools?id=${encodeURIComponent(poolId)}`, { signal: abort.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })
      .then((j) => setMembers(j.members))
      .catch((e) => { if (!abort.signal.aborted) setPoolError(e.message || tr("无法读取股票池")); });
    return () => abort.abort();
  }, [poolId, tr]);

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
      setWatchError(e instanceof Error ? e.message : tr("无法加入自选"));
    } finally {
      setStarring("");
    }
  };
  const watched = useMemo(() => new Set((watch?.stocks ?? []).map((s) => s.symbol)), [watch]);

  const tabNames = useMemo(() => {
    const groups = watch?.groups ?? [];
    const names = new Map<string, string>([["all", tr("全部")], ["", tr("未分组")], ...groups.map((g) => [g.id, g.name] as [string, string])]);
    const order = watch?.tabOrder ?? ["all", "", ...groups.map((g) => g.id)];
    return order.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! }));
  }, [watch, tr]);

  const addAndClearSearch = (stocks: PickedStock[]) => {
    onAdd(stocks);
    setQuery("");
    setResults([]);
  };

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
              title={added ? tr("已在表格中") : tr("加入表格")}
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

  const mf = memberFilter.trim().toLowerCase();
  const filteredMembers = useMemo(() => {
    if (!members) return [];
    if (!mf) return members;
    return members.filter((s) => s.symbol.toLowerCase().includes(mf) || s.name.toLowerCase().includes(mf));
  }, [members, mf]);

  const current: PickedStock[] = tab === "watchlist" ? watchStocks : filteredMembers;
  const prefixN = Math.max(0, Math.min(remainingSlots, current.length, 50));
  const select = "min-h-9 md:min-h-7 min-w-0 flex-1 rounded-lg border border-fs-border bg-fs-elevated px-2 text-sm md:text-xs";

  return (
    <section aria-label={tr("股票")} className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label={tr("股票来源")} className="flex border-b border-fs-border px-1">
        {tabBtn("watchlist", tr("我的自选股"))}
        {tabBtn("pools", tr("系统股票池"))}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2 md:py-1">
        {tab === "watchlist" ? (
          <select aria-label={tr("自选分组")} className={select} value={group} onChange={(e) => setGroup(e.target.value)}>
            {tabNames.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ) : (
          <select aria-label={tr("系统股票池")} className={select} value={poolId} onChange={(e) => setPoolId(e.target.value)} disabled={!pools}>
            {(pools ?? []).map((p) => <option key={p.id} value={p.id}>{p.label}（{p.count}）</option>)}
          </select>
        )}
        <button
          type="button"
          disabled={!prefixN}
          onClick={() => onAdd(current.slice(0, prefixN))}
          className="min-h-9 md:min-h-7 shrink-0 rounded-lg border border-fs-border px-3 text-sm md:text-xs hover:bg-fs-elevated disabled:opacity-40"
          title={prefixN ? tr("按当前列表顺序加入前 {prefixN} 只", { prefixN }) : tr("没有可加入的股票")}
        >{tr("前")}{" "}{prefixN || "N"}{" "}{tr("只")}</button>
        <button
          type="button"
          disabled={!current.length}
          onClick={() => onAdd(current)}
          className="min-h-9 md:min-h-7 shrink-0 rounded-lg border border-fs-border px-3 text-sm md:text-xs hover:bg-fs-elevated disabled:opacity-40"
        >{tr("全部加入")}</button>
      </div>

      {tab === "pools" && members && members.length > 12 ? (
        <div className="px-3 pb-1">
          <input
            type="search"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            placeholder={tr("在池内筛选（共 {length} 只）", { length: members.length })}
            aria-label={tr("池内筛选")}
            className="min-h-9 md:min-h-7 w-full rounded-lg border border-fs-border bg-fs-elevated px-2 text-sm md:text-xs"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "watchlist" ? (
          watchError ? <p className="px-3 py-4 text-sm md:text-xs text-fs-negative">{watchError}</p>
          : !watch ? <p className="px-3 py-4 text-sm md:text-xs text-fs-muted">{tr("正在加载自选股…")}</p>
          : !watchStocks.length ? <p className="px-3 py-4 text-sm md:text-xs text-fs-muted">{tr("这个分组还没有股票。可用下方搜索框添加，☆ 收藏进自选。")}</p>
          : stockList(watchStocks)
        ) : poolError ? <p className="px-3 py-4 text-sm md:text-xs text-fs-negative">{poolError}</p>
          : !members ? <p className="px-3 py-4 text-sm md:text-xs text-fs-muted">{tr("正在读取…")}</p>
          : !filteredMembers.length ? <p className="px-3 py-4 text-sm md:text-xs text-fs-muted">{mf ? tr("池内没有匹配的股票") : tr("这个池暂时没有成分")}</p>
          : stockList(filteredMembers)}
      </div>

      <div className="relative border-t border-fs-border p-3">
        {query.trim() ? (
          <div className="absolute inset-x-3 bottom-full z-50 mb-1 max-h-72 overflow-y-auto rounded-lg border border-fs-border bg-fs-bg shadow-lg">
            {searching && !results.length ? <p className="px-3 py-3 text-sm md:text-xs text-fs-muted">{tr("搜索中…")}</p>
              : !results.length ? <p className="px-3 py-3 text-sm md:text-xs text-fs-muted">{tr("没有找到美股，试试代码或英文名")}</p>
              : (
                <ul className="divide-y divide-fs-border">
                  {results.map((r) => (
                    <li key={r.symbol} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => addAndClearSearch([{ symbol: r.symbol, name: r.name }])}
                        className="flex min-h-10 md:min-h-8 min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm md:text-xs hover:bg-fs-elevated"
                      >
                        <span className="w-16 shrink-0 font-medium">{r.symbol}</span>
                        <span className="min-w-0 flex-1 truncate text-fs-muted">{r.name}</span>
                        {r.type === "ETF" ? <span className="text-xs text-fs-muted">ETF</span> : null}
                      </button>
                      {watch?.userId ? (
                        <button
                          type="button"
                          disabled={watched.has(r.symbol) || starring === r.symbol}
                          onClick={() => void addToWatchlist(r)}
                          aria-label={watched.has(r.symbol) ? tr("{symbol} 已在自选", { symbol: r.symbol }) : tr("把 {symbol} 加入自选", { symbol: r.symbol })}
                          title={watched.has(r.symbol) ? tr("已在自选") : tr("加入自选（未分组）")}
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
            if (e.key === "Enter" && results[0]) {
              e.preventDefault();
              addAndClearSearch([{ symbol: results[0].symbol, name: results[0].name }]);
            }
            if (e.key === "Escape") setQuery("");
          }}
          placeholder={tr("输入美股代码或名称，回车加入")}
          aria-label={tr("搜索股票")}
          className="min-h-10 md:min-h-8 w-full rounded-lg border border-fs-border bg-fs-elevated px-3 text-sm md:text-xs"
        />
      </div>
    </section>
  );
}
