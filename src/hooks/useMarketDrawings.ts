"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { drawingStorageKey, validateDrawings, mergeDrawingVersions, type MarketDrawing } from "@/lib/chart/marketDrawings";
import { randomUUID } from "@/lib/randomId";
export const MarketDrawingOwnerContext = createContext<{ ready: boolean; userId: string | null; symbols: string[] } | null>(null);
type Cache = { drawings: MarketDrawing[]; revision: number; dirty: boolean; cloud: boolean; edited?: boolean };
type Session = Cache & { key: string; url: string; userId: string | null; busy: boolean; blocked: boolean; active: boolean; version: number };
// A timeframe switch remounts the workspace. Let its last write finish before
// loading that same scope in the replacement instance.
const pendingSaves = new Map<string, Promise<void>>();
function readCache(key: string): Cache | null {
  try { const r = JSON.parse(localStorage.getItem(key) ?? "null"); return r ? { ...r, drawings: validateDrawings(r.drawings) } : null; } catch { return null; }
}
export function useMarketDrawings(source: string, symbol: string, interval: string, adjustment: string) {
  const owner = useContext(MarketDrawingOwnerContext);
  const watched = owner?.symbols.includes(symbol.trim().toUpperCase());
  const [drawings, setState] = useState<MarketDrawing[]>([]);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("正在加载图形…");
  const [conflict, setConflict] = useState(false);
  const [past, setPast] = useState<MarketDrawing[][]>([]), [future, setFuture] = useState<MarketDrawing[][]>([]);
  const session = useRef<Session | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((s: Session) => {
    try { localStorage.setItem(s.key, JSON.stringify({ drawings: s.drawings, revision: s.revision, dirty: s.dirty, cloud: s.cloud, edited: s.edited })); return true; }
    catch { if (s.active) setStatus("本地存储不可用，请勿关闭页面"); return false; }
  }, []);
  const save = useCallback(async (s: Session) => {
    if (!s.dirty || !s.cloud || s.busy || s.blocked) return;
    s.busy = true;
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    pendingSaves.set(s.key, pending);
    if (s.active) setStatus("正在保存到云端…");
    try {
      // Serialize edits: the next snapshot uses the revision returned by this write.
      while (s.dirty && !s.blocked) {
        const version = s.version;
        const response = await fetch(s.url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: s.userId, revision: s.revision, drawings: s.drawings }), keepalive: true });
        const data = await response.json();
        if (!response.ok) {
          if (data.conflict || response.status === 401 || response.status === 409) s.blocked = true;
          if (data.conflict && s.active) setConflict(true);
          if (response.status === 403) { s.cloud = false; s.dirty = false; persist(s); }
          throw new Error(data.error ?? "云端保存失败，草稿已保留在本地");
        }
        s.revision = data.revision;
        s.dirty = s.version !== version;
        if (!s.dirty) s.edited = false;
        const cached = persist(s);
        if (s.active) setStatus(cached ? "自选股 · 已保存到云端" : "已保存到云端；本地缓存不可用");
      }
    } catch (e) { if (s.active) setStatus(e instanceof Error ? e.message : "云端保存失败，草稿已保留在本地"); }
    finally { s.busy = false; finish(); if (pendingSaves.get(s.key) === pending) pendingSaves.delete(s.key); }
  }, [persist]);
  const [reloadVersion, setReloadVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setReady(false); setState([]); setPast([]); setFuture([]); setConflict(false);
    setStatus("正在加载图形…");
    if (owner && !owner.ready) return;
    const url = `/api/tools/market-drawings?${new URLSearchParams({ source, symbol, adjust: adjustment })}`;
    async function load() {
      try {
        if (owner) await pendingSaves.get(drawingStorageKey(owner.userId, source, symbol, adjustment));
        if (cancelled) return;
        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (cancelled) return;
        if (owner && data.userId !== owner.userId) { setStatus("账号已变化，请重新加载自选股"); return; }
        const key = drawingStorageKey(data.userId, source, symbol, adjustment);
        const cached = readCache(key);
        const remote = validateDrawings(data.drawings);
        // Migrating legacy anonymous drawings into an authenticated account would
        // attribute shared-browser data to the wrong user, so only guests import it.
        let legacy: MarketDrawing[] = [];
        if (!cached && !data.userId) {
          try { legacy = validateDrawings(JSON.parse(localStorage.getItem(`kline-drawings-v1:${source}:${symbol}:${interval}:${adjustment}`) ?? "[]")); } catch { /* damaged legacy JSON */ }
        }
        const promoting = Boolean(data.cloud && cached && !cached.cloud && (cached.edited || cached.drawings.length));
        const useLocal = cached && (cached.dirty || !data.cloud || promoting);
        const initial = promoting && cached!.drawings.length ? mergeDrawingVersions(remote, cached!.drawings, randomUUID) : useLocal ? cached.drawings : data.cloud ? remote : cached?.drawings ?? (remote.length ? remote : legacy);
        const dirty = Boolean(data.cloud && (cached?.dirty || promoting));
        const blocked = dirty && Boolean(cached?.cloud && cached.revision !== data.revision);
        const s: Session = { key, url, userId: data.userId, cloud: data.cloud, drawings: initial, revision: blocked ? cached!.revision : data.revision, dirty, edited: cached?.edited, busy: false, blocked, active: true, version: 0 };
        session.current = s; setState(initial); setReady(true); setConflict(blocked);
        if (persist(s)) setStatus(blocked ? "云端有新版本，本地草稿已保留" : data.cloud ? "自选股 · 云端同步" : data.userId ? "非自选股 · 本地保存" : "游客 · 本地保存，登录后自选股可同步");
        if (dirty && !blocked) void save(s);
      } catch (e) {
        if (cancelled) return;
        // A known watchlist owner permits safe offline local editing. Never guess
        // the owner when authentication itself could not be established.
        const key = owner ? drawingStorageKey(owner.userId, source, symbol, adjustment) : null;
        const cache = key ? readCache(key) : null;
        if (key && owner) {
          const s: Session = { key, url, userId: owner.userId, drawings: cache?.drawings ?? [], revision: cache?.revision ?? 0, cloud: Boolean(owner.userId && watched), dirty: cache?.dirty ?? false, busy: false, blocked: true, active: true, version: 0 };
          session.current = s; setState(s.drawings); setReady(true);
          setStatus(s.cloud ? "云端暂不可用，编辑先保留本地；请重试同步" : "离线 · 本地保存");
        } else setStatus(e instanceof Error ? e.message : "无法读取图形，请重试");
      }
    }
    if (symbol.trim()) void load();
    return () => {
      cancelled = true;
      const s = session.current;
      if (s) { s.active = false; void save(s); }
      session.current = null;
      if (timer.current) clearTimeout(timer.current);
    };
    // interval is deliberately excluded: all timeframes share absolute anchors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, symbol, adjustment, owner?.ready, owner?.userId, watched, reloadVersion, persist, save]);
  const commit = useCallback((next: MarketDrawing[]) => {
    const s = session.current;
    if (!s || !s.active) return;
    try { next = validateDrawings(next); } catch (e) { setStatus(e instanceof Error ? e.message : "图形无效"); return; }
    s.drawings = next; s.version++; s.dirty = s.cloud; s.edited = true;
    setState(next);
    if (persist(s)) setStatus(s.cloud ? "云端保存待完成…" : s.userId ? "非自选股 · 已保存到本地" : "游客 · 已保存到本地");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(s); }, 500);
  }, [persist, save]);
  const setDrawings = useCallback((action: MarketDrawing[] | ((d: MarketDrawing[]) => MarketDrawing[])) => {
    const current = session.current?.drawings;
    if (!current) return;
    const next = typeof action === "function" ? action(current) : action;
    setPast(p => [...p.slice(-49), current]); setFuture([]); commit(next);
  }, [commit]);
  const undo = () => { const previous = past.at(-1); if (!previous) return; setPast(p => p.slice(0, -1)); setFuture(p => [...p, drawings]); commit(previous); };
  const redo = () => { const next = future.at(-1); if (!next) return; setFuture(p => p.slice(0, -1)); setPast(p => [...p, drawings]); commit(next); };
  async function resolveConflict(merge: boolean) {
    const s = session.current;
    if (!s || s.busy) return;
    try {
      const response = await fetch(s.url, { cache: "no-store" }); const data = await response.json();
      if (!response.ok || data.userId !== s.userId) throw new Error("账号已变化或无法读取云端，请重新加载");
      if (session.current !== s) return;
      const remote = validateDrawings(data.drawings);
      // Preserve both versions of differing objects rather than silently dropping edits.
      const next = merge ? mergeDrawingVersions(remote, s.drawings, randomUUID) : remote;
      validateDrawings(next);
      s.revision = data.revision; s.cloud = data.cloud; s.blocked = false;
      setConflict(false); commit(next);
    } catch (e) { setStatus(e instanceof Error ? e.message : "无法解决冲突，请重试"); }
  }
  useEffect(() => {
    const flush = () => { const s = session.current; if (s) void save(s); };
    const focus = () => { const s = session.current; if (!s || s.busy || s.dirty) { flush(); return; } setReloadVersion(v => v + 1); };
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush); window.addEventListener("online", flush); window.addEventListener("focus", focus); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("online", flush); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visibility); };
  }, [save]);
  return { drawings, setDrawings, ready, status, conflict, resolveConflict, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0, retry: () => { const s = session.current; if (s?.dirty && !s.blocked) void save(s); else setReloadVersion(v => v + 1); } };
}
