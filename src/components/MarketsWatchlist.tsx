"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";
import { symbolSearchErrorForUser } from "@/lib/data/symbolSearchUserMessage";

import { useMarketsWatchlist } from "@/hooks/useMarketsWatchlist";

export function MarketsWatchlist({ children, symbol, name, onSelect }: {
  children: ReactNode;
  symbol: string;
  name?: string;
  onSelect: (symbol: string, name?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { stocks, ready, saving, error: storageError, userId, reload, change } = useMarketsWatchlist();

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SymbolSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { inputRef.current?.focus(); void reload(); }
  }, [open, reload]);

  useEffect(() => {
    const q = query.trim();
    if (!q || !open) {
      setHits([]);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setHits([]);
    setError("");
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/data/symbol-search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await response.json() as { results?: SymbolSearchItem[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "搜索失败");
        if (!controller.signal.aborted) setHits((data.results ?? []).slice(0, 8));
      } catch (e) {
        if (!controller.signal.aborted) setError(symbolSearchErrorForUser(e instanceof Error ? e.message : String(e)));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, open]);

  function add(stock: SymbolSearchItem) {
    if (!stocks.some((item) => item.symbol === stock.symbol)) void change(stock, false);
  }

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  const currentAdded = stocks.some((stock) => stock.symbol === symbol);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 overflow-hidden">
      {open ? <button type="button" tabIndex={-1} aria-label="收起自选股面板" onClick={close} className="absolute inset-0 z-30 bg-black/20 md:hidden" /> : null}
      <aside aria-label="行情自选股" className={`shrink-0 border-r border-fs-border bg-fs-elevated/40 ${open ? "w-10 md:w-72" : "w-10"}`}>
        <button ref={toggleRef} type="button" aria-label="展开自选股" aria-expanded={open} aria-controls="markets-watchlist-panel" onClick={() => setOpen(true)} className={`flex min-h-20 w-full flex-col items-center gap-2 rounded py-3 text-xs font-semibold text-fs-accent-text hover:bg-fs-accent-soft ${open ? "invisible" : ""}`}>
          <span aria-hidden="true">☆</span><span className="[writing-mode:vertical-rl]">自选股</span><span aria-hidden="true">›</span>
        </button>
        {open ? <section id="markets-watchlist-panel" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }} className="absolute inset-y-0 left-0 z-40 flex w-[calc(100%_-_2.5rem)] max-w-80 flex-col border-r border-fs-border bg-fs-bg shadow-xl md:w-72 md:shadow-none">
          <header className="flex shrink-0 items-center justify-between border-b border-fs-border px-3 py-2">
            <h2 className="text-sm font-semibold text-fs-text">☆ 自选股 <span className="text-xs text-fs-muted">{stocks.length}</span></h2>
            <button type="button" onClick={close} className="min-h-10 rounded px-2 text-xs text-fs-accent-text hover:bg-fs-accent-soft">收起 ‹</button>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <label htmlFor="markets-watchlist-search" className="block text-xs text-fs-muted">添加自选股</label>
            <input ref={inputRef} id="markets-watchlist-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索代码或公司名称" className="w-full rounded-lg border border-fs-border bg-fs-elevated px-3 py-2 text-sm text-fs-text outline-none focus:border-fs-accent" />
            {symbol ? <button type="button" disabled={!ready || saving || currentAdded} onClick={() => add({ symbol, name: name ?? symbol, exchange: "" })} className="min-h-10 w-full rounded-lg border border-fs-border px-2 text-xs text-fs-accent-text hover:bg-fs-accent-soft disabled:text-fs-muted">{currentAdded ? `${symbol} 已在自选股中` : `☆ 添加当前标的 ${symbol}`}</button> : null}
            <div aria-live="polite" className="text-xs text-fs-muted">{loading ? "搜索中…" : error || (query.trim() && !hits.length ? "未找到匹配标的" : "")}</div>
            {hits.length ? <ul className="max-h-64 overflow-y-auto rounded-lg border border-fs-border">
              {hits.map((hit) => {
                const added = stocks.some((stock) => stock.symbol === hit.symbol);
                return <li key={hit.symbol} className="flex items-center gap-2 border-b border-fs-border p-2 last:border-0">
                  <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-fs-text">{hit.symbol}</div><div className="truncate text-xs text-fs-muted" title={hit.name}>{hit.name}</div></div>
                  <button type="button" disabled={added || !ready || saving} aria-label={`${added ? "已添加" : "添加"} ${hit.symbol}`} onClick={() => add(hit)} className="min-h-10 shrink-0 rounded px-2 text-xs text-fs-accent-text hover:bg-fs-accent-soft disabled:text-fs-muted">{added ? "已添加" : "+ 添加"}</button>
                </li>;
              })}
            </ul> : null}
            <div className="border-t border-fs-border pt-3 text-xs text-fs-muted">我的自选 · {stocks.length} 只</div>
            {!ready ? <p className="text-sm text-fs-muted">加载自选股…</p> : !stocks.length ? <p className="rounded-lg border border-dashed border-fs-border p-4 text-sm leading-6 text-fs-muted">搜索添加你关注的股票，点击列表即可切换行情。</p> : <ul className="space-y-1">
              {stocks.map((stock) => <li key={stock.symbol} className={`flex items-center rounded-lg border ${symbol === stock.symbol ? "border-fs-accent/30 bg-fs-accent-soft" : "border-transparent bg-fs-elevated/50"}`}>
                <button type="button" aria-label={`查看 ${stock.symbol} 行情`} aria-pressed={symbol === stock.symbol} onClick={() => { onSelect(stock.symbol, stock.name); if (window.matchMedia("(max-width: 767px)").matches) close(); }} className="min-w-0 flex-1 rounded p-3 text-left hover:text-fs-accent-text"><span className="block text-sm font-semibold">{stock.symbol}</span><span className="block truncate text-xs text-fs-muted" title={stock.name}>{stock.name}</span></button>
                <button type="button" aria-label={`移除 ${stock.symbol}`} disabled={!ready || saving} onClick={() => void change(stock, true)} className="min-h-10 min-w-10 rounded text-fs-muted hover:bg-fs-elevated hover:text-fs-negative">×</button>
              </li>)}
            </ul>}
          </div>
          <footer className="shrink-0 border-t border-fs-border px-3 py-2 text-xs leading-5 text-fs-muted">{saving ? "正在保存…" : !ready ? "正在连接自选股存储…" : userId ? "已同步到当前账号，可跨设备访问。" : "游客自选保存在本机；登录后使用账号自选。"}{storageError ? <div role="status" className="text-fs-negative">{storageError}<button type="button" disabled={saving} onClick={() => void reload()} className="ml-2 underline">重新加载</button></div> : null}</footer>
        </section> : null}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
