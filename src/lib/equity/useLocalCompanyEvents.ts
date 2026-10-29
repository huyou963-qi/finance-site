"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LOCAL_EVENTS_CHANGED, loadLocalCompanyEvents, milestoneToStoredEvent, type CompanyMilestone, type LocalEventImportTarget } from "./companyMilestones";
import { prepareEventPackImport, selectLocalPackEvents, type EventPackMetadata, type EventImportReceipt, type LocalEventPack } from "./localEventPacks";
export type { LocalEventPack } from "./localEventPacks";

const packKey = (uid: string) => `event-packs:v2:${uid}`;

/** Versioned packages retain the complete original events. Legacy storage remains as a backup. */
export function useLocalCompanyEvents(symbol: string, enabled = true) {
  const [userId, setUserId] = useState("anon");
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authAttempt, setAuthAttempt] = useState(0);
  const retryAuth = useCallback(() => setAuthAttempt(n => n + 1), []);
  const [loaded, setLoaded] = useState<{ userId: string; packs: LocalEventPack[] }>({ userId: "", packs: [] });

  const sym = symbol.trim().toUpperCase();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, request = 0;
    const resolve = () => {
      const current = ++request;
      fetch("/api/auth/me", { cache: "no-store" }).then(async r => {
        if (!r.ok && r.status !== 401) throw new Error("无法确认账号");
        return r.ok ? await r.json() as { user?: { id?: string } } : null;
      }).then(j => { if (!cancelled && current === request) { setUserId(j?.user?.id?.trim() || "anon"); setReady(true); setAuthError(""); } })
        .catch(() => { if (!cancelled && current === request) setAuthError("暂时无法确认账号，请重试；不会将事件写入其他账号分区"); });
    };
    resolve(); window.addEventListener("focus", resolve);
    return () => { cancelled = true; window.removeEventListener("focus", resolve); };
  }, [enabled, authAttempt]);
  const reload = useCallback(() => {
    let stored: LocalEventPack[];
    try {
      const raw = localStorage.getItem(packKey(userId));
      if (raw) stored = JSON.parse(raw);
      else {
        stored = [];
        const prefix = `company-events-local:v1:${userId}:`;
        for (const key of Object.keys(localStorage).filter(k => k.startsWith(prefix))) {
          const targetSymbol = key.slice(prefix.length);
          const legacy = loadLocalCompanyEvents(userId, targetSymbol, targetSymbol === "*" ? "all-assets" : "symbol");
          if (legacy.length) stored.push({ id: `legacy:${targetSymbol}`, name: targetSymbol === "*" ? "原通用事件" : `${targetSymbol} 原本地事件`, target: targetSymbol === "*" ? "all-assets" : "symbol", symbols: targetSymbol === "*" ? [] : [targetSymbol], enabled: true, importedAt: new Date().toISOString(), events: legacy.map(milestoneToStoredEvent) });
        }
        localStorage.setItem(packKey(userId), JSON.stringify(stored));
      }
      if (!Array.isArray(stored)) return;
    } catch { return; }
    setLoaded({ userId, packs: stored });
  }, [userId]);
  useEffect(() => {
    if (!ready || !enabled) return;
    reload(); window.addEventListener(LOCAL_EVENTS_CHANGED, reload); window.addEventListener("storage", reload);
    return () => { window.removeEventListener(LOCAL_EVENTS_CHANGED, reload); window.removeEventListener("storage", reload); };
  }, [reload, ready, enabled]);
  const write = useCallback((change: (items: LocalEventPack[]) => LocalEventPack[]) => {
    if (!ready || !enabled) throw new Error("正在确认当前账号，请稍后重试");
    const previous = JSON.parse(localStorage.getItem(packKey(userId)) || "[]") as LocalEventPack[];
    localStorage.setItem(packKey(userId), JSON.stringify(change(previous)));
    window.dispatchEvent(new Event(LOCAL_EVENTS_CHANGED));
  }, [ready, userId, enabled]);
  const importEvents = useCallback((items: CompanyMilestone[], target: LocalEventImportTarget, metadata?: EventPackMetadata): EventImportReceipt => {
    let receipt: EventImportReceipt | undefined;
    write(previous => {
      const plan = prepareEventPackImport(previous, items, target, sym, metadata);
      receipt = plan.receipt;
      return plan.packs;
    });
    return receipt!;
  }, [write, sym]);
  const clearAllAssets = useCallback(() => write(items => items.filter(p => p.target !== "all-assets")), [write]);
  const updatePack = useCallback((id: string, patch: Partial<Pick<LocalEventPack, "enabled" | "color" | "name">>) => write(items => items.map(p => p.id === id ? { ...p, ...patch } : p)), [write]);
  const deletePack = useCallback((id: string) => write(items => items.filter(p => p.id !== id)), [write]);
  const packs = useMemo(() => loaded.userId === userId ? loaded.packs : [], [loaded, userId]);
  const { events, allAssetEvents } = useMemo(() => selectLocalPackEvents(ready && enabled ? packs : [], sym), [packs, sym, ready, enabled]);
  return { events, allAssetEvents, allAssetCount: allAssetEvents.length, importEvents, clearAllAssets, updatePack, deletePack, packs, ready, authError, retryAuth };
}
