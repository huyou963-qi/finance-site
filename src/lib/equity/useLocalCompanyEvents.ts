"use client";

import { useCallback, useEffect, useState } from "react";
import { LOCAL_EVENTS_CHANGED, loadLocalCompanyEvents, milestoneToStoredEvent, parseMilestoneIngestJson, type CompanyMilestone, type LocalEventImportTarget } from "./companyMilestones";
import { normalizeEventColor } from "@/lib/data/eventPresentation";

export type LocalEventPack = {
  id: string; name: string; target: LocalEventImportTarget | "assets"; symbols?: string[];
  enabled: boolean; color?: string; version?: string; importedAt: string;
  events: Record<string, unknown>[];
};
const packKey = (uid: string) => `event-packs:v2:${uid}`;

/** Versioned packages retain the complete original events. Legacy storage remains as a backup. */
export function useLocalCompanyEvents(symbol: string, enabled = true) {
  const [userId, setUserId] = useState("anon");
  const [ready, setReady] = useState(false);
  const [packs, setPacks] = useState<LocalEventPack[]>([]);
  const [events, setEvents] = useState<CompanyMilestone[]>([]);
  const [allAssetEvents, setAllAssetEvents] = useState<CompanyMilestone[]>([]);
  const sym = symbol.trim().toUpperCase();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" }).then(async r => r.ok ? await r.json() as { user?: { id?: string } } : null)
      .then(j => { if (!cancelled) setUserId(j?.user?.id?.trim() || "anon"); })
      .catch(() => { if (!cancelled) setUserId("anon"); }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [enabled]);
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
    setPacks(stored);
    const applicable = stored.filter(p => p.enabled && (p.target === "all-assets" || p.symbols?.includes(sym)));
    const decode = (p: LocalEventPack) => parseMilestoneIngestJson({ events: p.events }).milestones.map(m => ({ ...m, record: { ...m.record, packId: p.id, packName: p.name, packColor: p.color }, color: normalizeEventColor(m.record?.color) || normalizeEventColor(p.color) || m.color }));
    const universal = applicable.filter(p => p.target === "all-assets").flatMap(decode);
    const specific = applicable.filter(p => p.target !== "all-assets").flatMap(decode);
    const byId = new Map(universal.map(m => [m.externalId, m]));
    specific.forEach(m => byId.set(m.externalId, m));
    setEvents([...byId.values()].sort((a,b) => a.occurredAt.localeCompare(b.occurredAt)));
    setAllAssetEvents(universal);
  }, [userId, sym]);
  useEffect(() => {
    if (!ready || !enabled) return;
    reload(); window.addEventListener(LOCAL_EVENTS_CHANGED, reload); window.addEventListener("storage", reload);
    return () => { window.removeEventListener(LOCAL_EVENTS_CHANGED, reload); window.removeEventListener("storage", reload); };
  }, [reload, ready, enabled]);
  const write = useCallback((change: (items: LocalEventPack[]) => LocalEventPack[]) => {
    if (!ready) throw new Error("正在确认当前账号，请稍后重试");
    const previous = JSON.parse(localStorage.getItem(packKey(userId)) || "[]") as LocalEventPack[];
    localStorage.setItem(packKey(userId), JSON.stringify(change(previous)));
    window.dispatchEvent(new Event(LOCAL_EVENTS_CHANGED));
  }, [ready, userId]);
  const importEvents = useCallback((items: CompanyMilestone[], target: LocalEventImportTarget, metadata?: { id?: string; name?: string; version?: string; color?: string; symbols?: string[] }) => {
    if (target === "symbol" && !sym && !metadata?.symbols?.length) throw new Error("请先选择标的");
    const id = metadata?.id || `${target}:${metadata?.name || "imported"}:${target === "symbol" ? (metadata?.symbols || [sym]).join(",") : "*"}`;
    write(previous => {
      const existing = previous.find(p => p.id === id);
      const merged = new Map((existing?.events || []).map(e => [String(e.externalId), e]));
      items.forEach(m => merged.set(m.externalId, milestoneToStoredEvent(m)));
      const pack: LocalEventPack = { id, name: metadata?.name || "导入事件", target: metadata?.symbols?.length ? "assets" : target, symbols: metadata?.symbols || (target === "symbol" ? [sym] : []), enabled: true, color: normalizeEventColor(metadata?.color), version: metadata?.version, importedAt: new Date().toISOString(), events: [...merged.values()] };
      // Successful re-import replaces matching legacy nodes without deleting unrelated annotations.
      return [...previous.filter(p => p.id !== id).map(p => p.id.startsWith("legacy:") && p.target === target && (target === "all-assets" || p.symbols?.includes(sym)) ? { ...p, events: p.events.filter(e => !items.some(m => m.externalId === e.externalId)) } : p).filter(p => p.events.length), pack];
    });
  }, [write, sym]);
  const clearAllAssets = useCallback(() => write(items => items.filter(p => p.target !== "all-assets")), [write]);
  const updatePack = useCallback((id: string, patch: Partial<Pick<LocalEventPack, "enabled" | "color" | "name">>) => write(items => items.map(p => p.id === id ? { ...p, ...patch } : p)), [write]);
  const deletePack = useCallback((id: string) => write(items => items.filter(p => p.id !== id)), [write]);
  return { events, allAssetEvents, allAssetCount: allAssetEvents.length, importEvents, clearAllAssets, updatePack, deletePack, packs, ready };
}
