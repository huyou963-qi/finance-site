"use client";

import { useEffect, useRef, useState } from "react";
import { mergeVisibleStockOrder, orderWatchlistStocks, type WatchlistStock } from "@/lib/data/marketWatchlist";

export function useWatchlistStockSort(stocks: WatchlistStock[], group: string, owner: string | null, ready: boolean, saving: boolean, reorder: (order: string[]) => Promise<boolean>) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const stockKey = stocks.map(stock => stock.symbol).join(",");
  useEffect(() => {
    cleanupRef.current?.();
    setDraft(null);
    return () => cleanupRef.current?.();
  }, [stockKey, group, owner, ready]);

  const ordered = orderWatchlistStocks(stocks, draft);
  const visible = group === "all" ? ordered : ordered.filter(stock => (stock.groupId ?? "") === group);
  async function save(order: string[]) {
    setDraft(order);
    try { await reorder(order); } finally { setDraft(null); }
  }
  function shift(symbol: string, delta: number) {
    if (!ready || saving) return;
    const order = visible.map(stock => stock.symbol);
    const from = order.indexOf(symbol), to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(from, 1); order.splice(to, 0, symbol);
    void save(mergeVisibleStockOrder(stocks, order));
  }
  function start(event: React.PointerEvent<HTMLButtonElement>, symbol: string) {
    if (!ready || saving || event.button !== 0 || visible.length < 2) return;
    event.preventDefault();
    cleanupRef.current?.();
    const handle = event.currentTarget, pointerId = event.pointerId;
    const original = visible.map(stock => stock.symbol), order = [...original];
    const scroller = handle.closest<HTMLElement>("[data-watchlist-scroll]");
    const startX = event.clientX, startY = event.clientY;
    let x = startX, y = startY, moved = false, ended = false, frame = 0;
    handle.setPointerCapture(pointerId);
    const update = () => {
      const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-watchlist-stock]");
      const targetSymbol = target?.dataset.watchlistStock;
      if (!targetSymbol || targetSymbol === symbol || !scroller?.contains(target)) return;
      const from = order.indexOf(symbol), to = order.indexOf(targetSymbol);
      if (from < 0 || to < 0) return;
      order.splice(from, 1); order.splice(to, 0, symbol);
      setDraft(mergeVisibleStockOrder(stocks, order));
    };
    const scroll = () => {
      if (ended) return;
      if (moved && scroller) {
        const rect = scroller.getBoundingClientRect();
        const amount = y < rect.top + 32 ? -8 : y > rect.bottom - 32 ? 8 : 0;
        if (amount) { scroller.scrollTop += amount; update(); }
      }
      frame = requestAnimationFrame(scroll);
    };
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || ended) return;
      x = pointer.clientX; y = pointer.clientY;
      if (!moved && Math.hypot(x - startX, y - startY) < 5) return;
      moved = true; setDragging(symbol); update();
    };
    const cleanup = () => {
      ended = true; cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancelPointer);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
      handle.removeEventListener("lostpointercapture", cancel);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      cleanupRef.current = null; setDragging(null);
    };
    const cancel = () => { if (ended) return; cleanup(); setDraft(null); };
    const cancelPointer = (pointer: PointerEvent) => { if (pointer.pointerId === pointerId) cancel(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } };
    const finish = (pointer: PointerEvent) => {
      if (pointer.pointerId !== pointerId || ended) return;
      move(pointer); cleanup();
      if (moved && order.some((item, index) => item !== original[index])) void save(mergeVisibleStockOrder(stocks, order));
      else setDraft(null);
    };
    cleanupRef.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancelPointer);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    handle.addEventListener("lostpointercapture", cancel);
    frame = requestAnimationFrame(scroll);
  }
  return { visible, dragging, start, shift };
}
