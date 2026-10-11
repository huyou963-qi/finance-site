"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeWatchlistTabOrder, applyWatchlistGroupChange, parseWatchlistGroupId, parseWatchlistGroupName, parseWatchlistItem, type WatchlistData, type WatchlistGroupChange, type WatchlistStock } from "@/lib/data/marketWatchlist";
import { randomUUID } from "@/lib/randomId";

const STORAGE_KEY = "finance-site:markets-watchlist:v2";
const ENDPOINT = "/api/tools/market-watchlist";
const EMPTY: WatchlistData = { stocks: [], groups: [] };

function loadGuest(): WatchlistData {
  const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("finance-site:markets-watchlist:v1") ?? "[]");
  const state: WatchlistData = { stocks: [], groups: [] };
  for (const item of Array.isArray(value?.groups) ? value.groups : []) {
    try {
      const id = parseWatchlistGroupId(item.id);
      const name = parseWatchlistGroupName(item.name);
      if (id && !state.groups.some((group) => group.id === id || group.name === name)) state.groups.push({ id, name });
    } catch { /* 忽略损坏的本地分组 */ }
  }
  for (const item of Array.isArray(value) ? value : Array.isArray(value?.stocks) ? value.stocks : []) {
    try {
      const stock = parseWatchlistItem(item);
      const groupId = parseWatchlistGroupId(item.groupId);
      if (!state.stocks.some((existing) => existing.symbol === stock.symbol)) state.stocks.push({ ...stock, groupId: state.groups.some((group) => group.id === groupId) ? groupId : null });
    } catch { /* 忽略损坏的本地条目 */ }
  }
  return { ...state, tabOrder: normalizeWatchlistTabOrder(state.groups, value?.tabOrder) };
}

export function useMarketsWatchlist() {
  const [state, setState] = useState<WatchlistData>(EMPTY);
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
    setState(EMPTY);
    setError("");
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      const data = await response.json() as WatchlistData & { userId: string | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "无法加载自选股");
      if (requestId !== sequence.current) return;
      setUserId(data.userId);
      setState(data.userId ? { stocks: data.stocks, groups: data.groups ?? [], tabOrder: normalizeWatchlistTabOrder(data.groups ?? [], data.tabOrder) } : loadGuest());
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

  async function mutate(method: string, body: object, guestNext: () => WatchlistData): Promise<boolean> {
    if (!ready || busy.current) return false;
    setError("");
    if (!userId) {
      try {
        const next = guestNext();
        setState(next);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
        catch { setError("浏览器无法保存，自选股仅在本次页面中保留。"); }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "分组操作失败");
        return false;
      }
    }
    busy.current = true;
    setSaving(true);
    const requestId = ++sequence.current;
    try {
      const response = await fetch(ENDPOINT, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, ...body }) });
      const data = await response.json() as WatchlistData & { error?: string };
      if (!response.ok) {
        if (response.status === 401 || response.status === 409) { setState(EMPTY); setReady(false); }
        throw new Error(data.error ?? "无法保存自选股");
      }
      if (requestId === sequence.current) setState({ stocks: data.stocks, groups: data.groups ?? [], tabOrder: normalizeWatchlistTabOrder(data.groups ?? [], data.tabOrder) });
      return true;
    } catch (e) {
      if (requestId === sequence.current) setError(e instanceof Error ? e.message : "无法保存自选股，请重试");
      return false;
    } finally { busy.current = false; setSaving(false); }
  }

  function change(stock: WatchlistStock, remove: boolean, groupId: string | null = null) {
    return mutate(remove ? "DELETE" : "POST", remove ? { symbol: stock.symbol } : { stock, groupId }, () => ({ ...state, stocks: remove ? state.stocks.filter((item) => item.symbol !== stock.symbol) : [...state.stocks.filter((item) => item.symbol !== stock.symbol), { ...stock, groupId }] }));
  }

  function changeGroup(change: WatchlistGroupChange) {
    const action = change.action === "createGroup" ? { ...change, groupId: randomUUID() } : change;
    return mutate("PATCH", change, () => applyWatchlistGroupChange(state, action));
  }

  return { ...state, ready, saving, error, userId, reload, change, changeGroup };
}
