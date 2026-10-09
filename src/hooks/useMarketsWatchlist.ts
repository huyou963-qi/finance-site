"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";
import { parseWatchlistItem } from "@/lib/data/marketWatchlist";

const STORAGE_KEY = "finance-site:markets-watchlist:v1";
const ENDPOINT = "/api/tools/market-watchlist";

function loadGuestStocks(): SymbolSearchItem[] {
  const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  if (!Array.isArray(value)) return [];
  const stocks = new Map<string, SymbolSearchItem>();
  for (const item of value) {
    try {
      const stock = parseWatchlistItem(item);
      stocks.set(stock.symbol, stock);
    } catch { /* 忽略旧版本或损坏的本地条目 */ }
  }
  return [...stocks.values()];
}

export function useMarketsWatchlist() {
  const [stocks, setStocks] = useState<SymbolSearchItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    if (busy.current) return;
    const requestId = ++sequence.current;
    setReady(false);
    setStocks([]);
    setError("");
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      const data = await response.json() as { userId: string | null; stocks: SymbolSearchItem[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "无法加载自选股");
      if (requestId !== sequence.current) return;
      setUserId(data.userId);
      setStocks(data.userId ? data.stocks : loadGuestStocks());
      setReady(true);
    } catch (e) {
      if (requestId === sequence.current) setError(e instanceof Error ? e.message : "无法加载自选股，请重试");
    }
  }, []);

  useEffect(() => {
    void reload();
    const onFocus = () => { void reload(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void reload(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sequence.current += 1;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  async function change(stock: SymbolSearchItem, remove: boolean) {
    if (!ready || busy.current) return;
    setError("");
    if (!userId) {
      const next = remove ? stocks.filter((item) => item.symbol !== stock.symbol) : [...stocks.filter((item) => item.symbol !== stock.symbol), stock];
      setStocks(next);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
      catch { setError("浏览器无法保存，自选股仅在本次页面中保留。"); }
      return;
    }
    busy.current = true;
    setSaving(true);
    const requestId = ++sequence.current;
    try {
      const response = await fetch(ENDPOINT, {
        method: remove ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remove ? { userId, symbol: stock.symbol } : { userId, stock }),
      });
      const data = await response.json() as { stocks: SymbolSearchItem[]; error?: string };
      if (!response.ok) {
        if (response.status === 401 || response.status === 409) {
          setStocks([]);
          setReady(false);
        }
        throw new Error(data.error ?? "无法保存自选股");
      }
      if (requestId === sequence.current) setStocks(data.stocks);
    } catch (e) {
      if (requestId === sequence.current) setError(e instanceof Error ? e.message : "无法保存自选股，请重试");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return { stocks, ready, saving, error, userId, reload, change };
}
