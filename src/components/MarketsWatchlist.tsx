"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";
import { useMarketsWatchlist } from "@/hooks/useMarketsWatchlist";
import { normalizeWatchlistTabOrder, type WatchlistGroup, type WatchlistGroupChange } from "@/lib/data/marketWatchlist";
import { useIsMobile } from "@/hooks/useIsMobile";

function WatchlistChevron({ collapsed }: { collapsed: boolean }) {
  return <svg viewBox="0 0 10 14" className="h-3 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={collapsed ? "M3.5 2.5 7.5 7l-4 4.5" : "M6.5 2.5 2.5 7l4 4.5"} /></svg>;
}

const HANDLE_CLASS = "absolute left-1/2 top-1/2 z-10 flex h-7 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-fs-border/70 bg-fs-elevated text-fs-muted shadow-sm transition hover:border-fs-accent hover:bg-fs-accent-soft hover:text-fs-text";

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
  const [open, setOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [mobileTab, setMobileTab] = useState<"watchlist" | "chart">("chart");
  const isMobile = useIsMobile();
  const panelOpen = isMobile ? mobileTab === "watchlist" : open;
  const { stocks, groups, tabOrder, ready, saving, error: storageError, reload, change, changeGroup } = useMarketsWatchlist();
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const orderedIds = normalizeWatchlistTabOrder(groups, draftOrder ?? tabOrder);
  const tabNames = new Map([...[{ id: "all", name: "全部" }, { id: "", name: "未分组" }], ...groups].map((group) => [group.id, group.name]));
  const tabDragCleanup = useRef<(() => void) | null>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [managing, setManaging] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [movingStock, setMovingStock] = useState<string | null>(null);
  const [removingStock, setRemovingStock] = useState<string | null>(null);
  const activeGroup = selectedGroup === "all" || selectedGroup === "" || groups.some((group) => group.id === selectedGroup) ? selectedGroup : "all";
  const visibleStocks = activeGroup === "all" ? stocks : stocks.filter((stock) => (stock.groupId ?? "") === activeGroup);

  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const resizeCleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => resizeCleanup.current?.(), []);
  useEffect(() => () => tabDragCleanup.current?.(), []);

  async function saveOrder(order: string[]) {
    setDraftOrder(order);
    try { await changeGroup({ action: "reorderGroups", order }); }
    finally { setDraftOrder(null); }
  }

  function shiftTab(id: string, delta: number) {
    const index = orderedIds.indexOf(id);
    const destination = index + delta;
    if (index < 0 || destination < 0 || destination >= orderedIds.length) return;
    const next = [...orderedIds];
    next.splice(index, 1);
    next.splice(destination, 0, id);
    void saveOrder(next);
  }

  function startTabDrag(event: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (!ready || saving || event.button !== 0) return;
    event.preventDefault();
    tabDragCleanup.current?.();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const original = [...orderedIds];
    let order = [...original];
    let moved = false;
    const handle = event.currentTarget;
    handle.setPointerCapture(pointerId);
    setDraggingTab(id);
    const cleanup = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      setDraggingTab(null);
      tabDragCleanup.current = null;
    };
    const cancel = () => { cleanup(); setDraftOrder(null); };
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      if (!moved && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 5) return;
      moved = true;
      const nav = tabsRef.current;
      if (nav) {
        const bounds = nav.getBoundingClientRect();
        if (pointer.clientX > bounds.right - 24) nav.scrollLeft += 16;
        else if (pointer.clientX < bounds.left + 24) nav.scrollLeft -= 16;
      }
      const target = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest<HTMLElement>("[data-watchlist-tab]");
      const targetId = target?.dataset.watchlistTab;
      if (!target || targetId === undefined || targetId === id || !nav?.contains(target)) return;
      const from = order.indexOf(id);
      const to = order.indexOf(targetId);
      if (from < 0 || to < 0) return;
      order.splice(from, 1);
      order.splice(to, 0, id);
      setDraftOrder([...order]);
    };
    const finish = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      cleanup();
      if (moved && order.some((item, index) => item !== original[index])) void saveOrder(order);
      else setDraftOrder(null);
    };
    tabDragCleanup.current = cancel;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
  }

  useEffect(() => {
    if (panelOpen) {
      closeRef.current?.focus();
      void reload();
    }
  }, [panelOpen, reload]);

  function add(stock: SymbolSearchItem) {
    if (!stocks.some((item) => item.symbol === stock.symbol)) void change(stock, false, activeGroup === "all" ? null : activeGroup || null);
  }

  function close() {
    setRemovingStock(null);
    if (isMobile) setMobileTab("chart");
    else setOpen(false);
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  }

  function startResize(event: React.MouseEvent) {
    event.preventDefault();
    resizeCleanup.current?.();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    const move = (moveEvent: MouseEvent) => setSidebarWidth(Math.min(520, Math.max(200, startWidth + moveEvent.clientX - startX)));
    const cleanup = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      resizeCleanup.current = null;
    };
    resizeCleanup.current = cleanup;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", cleanup);
  }

  const currentAdded = stocks.some((stock) => stock.symbol === symbol);

  const panel = (
    <aside id="markets-watchlist-panel" aria-label="行情自选股" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }} className="flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden bg-fs-bg md:bg-fs-elevated" style={isMobile ? { flex: "1 1 auto", width: "100%" } : { width: sidebarWidth, maxWidth: 520 }}>
          {isMobile ? <div className="flex shrink-0 justify-end px-3"><button ref={closeRef} type="button" onClick={close} className="min-h-11 rounded px-2 text-xs text-fs-accent-text">返回行情</button></div> : null}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 md:px-4 md:py-4">
            <div className="flex items-center gap-1">
              <nav ref={tabsRef} aria-label="自选股分组" className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1">
                {orderedIds.map((id) => <span key={id} data-watchlist-tab={id} className={`flex shrink-0 items-center rounded-md border text-xs ${activeGroup === id ? "border-fs-accent/50 bg-fs-accent-soft font-semibold text-fs-accent-text" : "border-fs-border bg-fs-bg text-fs-muted"} ${draggingTab === id ? "opacity-50 ring-1 ring-fs-accent" : ""}`}>
                  <button type="button" aria-pressed={activeGroup === id} disabled={!ready || saving} onClick={() => { setSelectedGroup(id); setRemovingStock(null); }} onKeyDown={(event) => { if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); shiftTab(id, event.key === "ArrowLeft" ? -1 : 1); } }} title={tabNames.get(id)} className="min-h-8 max-w-32 truncate pl-2 pr-1">{tabNames.get(id)}</button>
                  <button type="button" aria-label={`拖动 ${tabNames.get(id)} 分组排序`} disabled={!ready || saving} onPointerDown={(event) => startTabDrag(event, id)} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); shiftTab(id, event.key === "ArrowLeft" ? -1 : 1); } }} title="拖动排序；方向键前移或后移" className="min-h-8 w-4 cursor-grab touch-none select-none text-fs-muted active:cursor-grabbing">⋮</button>
                </span>)}
              </nav>
              <button type="button" disabled={!ready || saving} aria-expanded={managing} onClick={() => setManaging((value) => !value)} className="min-h-8 shrink-0 rounded px-2 text-xs text-fs-accent-text">{managing ? "完成" : "管理分组"}</button>
            </div>
            {managing ? <section aria-label="分组管理" className="space-y-2 rounded-lg border border-fs-border bg-fs-elevated/40 p-2">
              <div aria-label="分组排序" className="space-y-1">{orderedIds.map((id, index) => <div key={id} className="flex items-center gap-1 text-xs"><span className="min-w-0 flex-1 truncate">{tabNames.get(id)}</span><button type="button" aria-label={`前移 ${tabNames.get(id)}`} disabled={!ready || saving || index === 0} onClick={() => shiftTab(id, -1)} className="min-h-8 px-1 text-fs-accent-text disabled:text-fs-muted/50">前移</button><button type="button" aria-label={`后移 ${tabNames.get(id)}`} disabled={!ready || saving || index === orderedIds.length - 1} onClick={() => shiftTab(id, 1)} className="min-h-8 px-1 text-fs-accent-text disabled:text-fs-muted/50">后移</button></div>)}</div>
              <form onSubmit={async (event) => { event.preventDefault(); if (await changeGroup({ action: "createGroup", name: newGroupName })) setNewGroupName(""); }} className="flex items-center gap-1">
                <input aria-label="新分组名称" placeholder="新分组名称" maxLength={30} value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} disabled={!ready || saving} className="min-w-0 flex-1 rounded border border-fs-border bg-fs-bg px-2 py-1 text-xs" />
                <button disabled={!ready || saving || !newGroupName.trim()} className="min-h-8 shrink-0 px-1 text-xs text-fs-accent-text">新增</button>
              </form>
              {groups.map((group) => <GroupEditor key={`${group.id}:${group.name}`} group={group} disabled={!ready || saving} onChange={changeGroup} />)}
            </section> : null}
            {symbol && !currentAdded && ready ? <button type="button" disabled={saving} onClick={() => add({ symbol, name: name ?? symbol, exchange: "" })} className="min-h-10 w-full rounded-lg border border-fs-border px-2 text-xs text-fs-accent-text hover:bg-fs-accent-soft disabled:text-fs-muted">☆ 添加当前标的 {symbol}</button> : null}
            {!ready ? <p className="text-sm text-fs-muted">加载自选股…</p> : !visibleStocks.length ? <p className="rounded-lg border border-dashed border-fs-border p-3 text-xs leading-5 text-fs-muted">{stocks.length ? "此分组暂无股票，可在股票卡片中调整分组。" : "在行情页顶部选择标的后，点击添加当前标的。"}</p> : <ul className="space-y-1">
              {visibleStocks.map((stock) => <li key={stock.symbol} className={`flex flex-wrap items-center rounded-lg border ${symbol === stock.symbol ? "border-fs-accent/30 bg-fs-accent-soft" : "border-transparent bg-fs-elevated/50"}`}>
                <button type="button" aria-label={`查看 ${stock.symbol} 行情`} aria-pressed={symbol === stock.symbol} onClick={() => { onSelect(stock.symbol, stock.name); if (isMobile) close(); }} className="min-w-0 flex-1 rounded px-2 py-1.5 text-left hover:text-fs-accent-text"><span className="block text-xs font-semibold leading-4">{stock.symbol}</span><span className="block truncate text-[10px] leading-4 text-fs-muted" title={stock.name}>{stock.name}</span></button>
                <button type="button" aria-label={`移除 ${stock.symbol}`} aria-expanded={removingStock === stock.symbol} disabled={!ready || saving} onClick={() => { setRemovingStock(stock.symbol); setMovingStock(null); }} className="min-h-8 min-w-8 rounded text-xs text-fs-muted md:min-h-7 md:min-w-7 hover:bg-fs-elevated hover:text-fs-negative">×</button>
                {removingStock === stock.symbol ? <div role="group" aria-label={`确认移除 ${stock.symbol}`} className="order-last w-full border-t border-fs-border px-2 py-1.5 text-xs" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setRemovingStock(null); } }}><p>确认从自选股移除 {stock.symbol}？</p><div className="flex gap-3"><button type="button" disabled={!ready || saving} onClick={async () => { if (await change(stock, true)) setRemovingStock(null); }} className="min-h-8 text-fs-negative">确认移除</button><button type="button" disabled={saving} onClick={() => setRemovingStock(null)} className="min-h-8 text-fs-muted">取消</button></div></div> : null}
                <button type="button" aria-label={`调整 ${stock.symbol} 分组`} aria-expanded={movingStock === stock.symbol} disabled={!ready || saving} onClick={() => setMovingStock((current) => current === stock.symbol ? null : stock.symbol)} className="min-h-8 min-w-8 rounded text-xs text-fs-muted hover:bg-fs-elevated">⋯</button>
                {movingStock === stock.symbol ? <div className="w-full border-t border-fs-border p-1.5"><select aria-label={`${stock.symbol} 所属分组`} disabled={!ready || saving} value={stock.groupId ?? ""} onChange={async (event) => { if (await changeGroup({ action: "moveStock", symbol: stock.symbol, groupId: event.target.value || null })) setMovingStock(null); }} className="min-h-8 w-full rounded border border-fs-border bg-fs-bg px-2 text-xs"><option value="">未分组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div> : null}
              </li>)}
            </ul>}
          </div>
          {storageError ? <div role="status" className="shrink-0 border-t border-fs-border px-3 py-2 text-xs text-fs-negative">{storageError}<button type="button" disabled={saving} onClick={() => void reload()} className="ml-2 underline">重新加载</button></div> : null}
    </aside>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 items-stretch overflow-hidden">
        {panelOpen ? panel : null}
        {!isMobile && !open ? <button ref={toggleRef} type="button" onClick={() => setOpen(true)} className="group relative flex w-3 shrink-0 items-stretch border-r border-fs-border bg-fs-elevated/90 transition hover:bg-fs-accent-soft/40" title="展开自选股" aria-label="展开自选股" aria-expanded={false} aria-controls="markets-watchlist-panel"><span className="mx-auto block h-full w-px bg-fs-border transition-colors group-hover:bg-fs-accent" /><span className={HANDLE_CLASS}><WatchlistChevron collapsed /></span></button> : null}
        {!isMobile && open ? <div className="group relative flex w-3 shrink-0 items-stretch border-x border-fs-border bg-fs-elevated/90">
          <div role="separator" tabIndex={0} aria-label="调整自选股宽度" aria-orientation="vertical" aria-valuemin={200} aria-valuemax={520} aria-valuenow={sidebarWidth} title="拖拽调节自选股宽度" onMouseDown={startResize} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); setSidebarWidth((width) => event.key === "Home" ? 200 : event.key === "End" ? 520 : Math.min(520, Math.max(200, width + (event.key === "ArrowRight" ? 20 : -20)))); } }} className="absolute inset-0 cursor-col-resize hover:bg-fs-accent-soft/60"><span className="mx-auto block h-full w-px bg-fs-border transition-colors group-hover:bg-fs-accent" /></div>
          <button ref={closeRef} type="button" onClick={close} onKeyDown={(event) => { if (event.key === "Escape") close(); }} onMouseDown={(event) => event.stopPropagation()} className={HANDLE_CLASS} title="折叠自选股" aria-label="折叠自选股" aria-expanded={true} aria-controls="markets-watchlist-panel"><WatchlistChevron collapsed={false} /></button>
        </div> : null}
        <div className={`min-h-0 min-w-0 flex-1 flex-col ${isMobile && panelOpen ? "hidden" : "flex"}`}>{children}</div>
      </div>
      {isMobile ? <nav aria-label="行情功能模块" className="flex shrink-0 border-t border-fs-border bg-white/95">
        <button ref={toggleRef} type="button" onClick={() => setMobileTab("watchlist")} aria-current={panelOpen ? "page" : undefined} className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${panelOpen ? "font-semibold text-fs-accent-text" : "text-fs-muted"}`}><span className="text-xl" aria-hidden="true">☆</span><span>自选股</span></button>
        <button type="button" onClick={() => setMobileTab("chart")} aria-current={!panelOpen ? "page" : undefined} className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${!panelOpen ? "font-semibold text-fs-accent-text" : "text-fs-muted"}`}><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 4v16h16M7 15l4-5 4 3 5-7" /></svg><span>行情</span></button>
      </nav> : null}
    </div>
  );
}
