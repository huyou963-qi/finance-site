"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";
import { useMarketsWatchlist } from "@/hooks/useMarketsWatchlist";
import type { WatchlistGroup, WatchlistGroupChange } from "@/lib/data/marketWatchlist";

function GroupEditor({ group, disabled, onChange }: { group: WatchlistGroup; disabled: boolean; onChange: (change: WatchlistGroupChange) => Promise<boolean> }) {
  const [name, setName] = useState(group.name);
  const [deleting, setDeleting] = useState(false);
  return <div className="space-y-1">
    <form onSubmit={(event) => { event.preventDefault(); void onChange({ action: "renameGroup", groupId: group.id, name }); }} className="flex items-center gap-1">
      <input aria-label={`编辑组名 ${group.name}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={30} disabled={disabled} className="min-w-0 flex-1 rounded border border-fs-border bg-fs-bg px-2 py-1 text-xs" />
      <button disabled={disabled || name.trim() === group.name} className="min-h-8 px-1 text-xs text-fs-accent-text">保存</button>
      <button type="button" disabled={disabled} onClick={() => setDeleting((value) => !value)} aria-label={`删除分组 ${group.name}`} className="min-h-8 px-1 text-xs text-fs-muted">删除</button>
    </form>
    {deleting ? <div className="rounded border border-fs-border p-2 text-xs"><p>删除后，组内股票移回未分组。</p><button disabled={disabled} onClick={() => void onChange({ action: "deleteGroup", groupId: group.id })} className="mr-3 min-h-8 text-fs-negative">确认删除分组</button><button onClick={() => setDeleting(false)} className="min-h-8 text-fs-muted">取消</button></div> : null}
  </div>;
}

export function MarketsWatchlist({ children, symbol, name, onSelect }: {
  children: ReactNode;
  symbol: string;
  name?: string;
  onSelect: (symbol: string, name?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { stocks, groups, ready, saving, error: storageError, reload, change, changeGroup } = useMarketsWatchlist();
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [managing, setManaging] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [movingStock, setMovingStock] = useState<string | null>(null);
  const activeGroup = selectedGroup === "all" || selectedGroup === "" || groups.some((group) => group.id === selectedGroup) ? selectedGroup : "all";
  const visibleStocks = activeGroup === "all" ? stocks : stocks.filter((stock) => (stock.groupId ?? "") === activeGroup);

  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      void reload();
    }
  }, [open, reload]);

  function add(stock: SymbolSearchItem) {
    if (!stocks.some((item) => item.symbol === stock.symbol)) void change(stock, false, activeGroup === "all" ? null : activeGroup || null);
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
            <button ref={closeRef} type="button" onClick={close} className="min-h-10 rounded px-2 text-xs text-fs-accent-text hover:bg-fs-accent-soft">收起 ‹</button>
          </header>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            <div className="flex items-center gap-1">
              <select aria-label="自选股分组" value={activeGroup} onChange={(event) => setSelectedGroup(event.target.value)} disabled={!ready || saving} className="min-h-8 min-w-0 flex-1 rounded border border-fs-border bg-fs-bg px-2 text-xs">
                <option value="all">全部</option><option value="">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <button type="button" disabled={!ready || saving} aria-expanded={managing} onClick={() => setManaging((value) => !value)} className="min-h-8 shrink-0 rounded px-2 text-xs text-fs-accent-text">{managing ? "完成" : "管理分组"}</button>
            </div>
            {managing ? <section aria-label="分组管理" className="space-y-2 rounded-lg border border-fs-border bg-fs-elevated/40 p-2">
              <form onSubmit={async (event) => { event.preventDefault(); if (await changeGroup({ action: "createGroup", name: newGroupName })) setNewGroupName(""); }} className="flex items-center gap-1">
                <input aria-label="新分组名称" placeholder="新分组名称" maxLength={30} value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} disabled={!ready || saving} className="min-w-0 flex-1 rounded border border-fs-border bg-fs-bg px-2 py-1 text-xs" />
                <button disabled={!ready || saving || !newGroupName.trim()} className="min-h-8 shrink-0 px-1 text-xs text-fs-accent-text">新增</button>
              </form>
              {groups.map((group) => <GroupEditor key={`${group.id}:${group.name}`} group={group} disabled={!ready || saving} onChange={changeGroup} />)}
            </section> : null}
            {symbol ? <button type="button" disabled={!ready || saving || currentAdded} onClick={() => add({ symbol, name: name ?? symbol, exchange: "" })} className="min-h-10 w-full rounded-lg border border-fs-border px-2 text-xs text-fs-accent-text hover:bg-fs-accent-soft disabled:text-fs-muted">{currentAdded ? `${symbol} 已在自选股中` : `☆ 添加当前标的 ${symbol}`}</button> : null}
            {!ready ? <p className="text-sm text-fs-muted">加载自选股…</p> : !visibleStocks.length ? <p className="rounded-lg border border-dashed border-fs-border p-3 text-xs leading-5 text-fs-muted">{stocks.length ? "此分组暂无股票，可在股票卡片中调整分组。" : "在行情页顶部选择标的后，点击添加当前标的。"}</p> : <ul className="space-y-1">
              {visibleStocks.map((stock) => <li key={stock.symbol} className={`flex flex-wrap items-center rounded-lg border ${symbol === stock.symbol ? "border-fs-accent/30 bg-fs-accent-soft" : "border-transparent bg-fs-elevated/50"}`}>
                <button type="button" aria-label={`查看 ${stock.symbol} 行情`} aria-pressed={symbol === stock.symbol} onClick={() => { onSelect(stock.symbol, stock.name); if (window.matchMedia("(max-width: 767px)").matches) close(); }} className="min-w-0 flex-1 rounded px-2 py-1.5 text-left hover:text-fs-accent-text"><span className="block text-xs font-semibold leading-4">{stock.symbol}</span><span className="block truncate text-[10px] leading-4 text-fs-muted" title={stock.name}>{stock.name}</span></button>
                <button type="button" aria-label={`移除 ${stock.symbol}`} disabled={!ready || saving} onClick={() => void change(stock, true)} className="min-h-8 min-w-8 rounded text-xs text-fs-muted md:min-h-7 md:min-w-7 hover:bg-fs-elevated hover:text-fs-negative">×</button>
                <button type="button" aria-label={`调整 ${stock.symbol} 分组`} aria-expanded={movingStock === stock.symbol} disabled={!ready || saving} onClick={() => setMovingStock((current) => current === stock.symbol ? null : stock.symbol)} className="min-h-8 min-w-8 rounded text-xs text-fs-muted hover:bg-fs-elevated">⋯</button>
                {movingStock === stock.symbol ? <div className="w-full border-t border-fs-border p-1.5"><select aria-label={`${stock.symbol} 所属分组`} disabled={!ready || saving} value={stock.groupId ?? ""} onChange={async (event) => { if (await changeGroup({ action: "moveStock", symbol: stock.symbol, groupId: event.target.value || null })) setMovingStock(null); }} className="min-h-8 w-full rounded border border-fs-border bg-fs-bg px-2 text-xs"><option value="">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div> : null}
              </li>)}
            </ul>}
          </div>
          {storageError ? <div role="status" className="shrink-0 border-t border-fs-border px-3 py-2 text-xs text-fs-negative">{storageError}<button type="button" disabled={saving} onClick={() => void reload()} className="ml-2 underline">重新加载</button></div> : null}
        </section> : null}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
