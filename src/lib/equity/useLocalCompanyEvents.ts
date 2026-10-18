"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LOCAL_EVENTS_CHANGED, loadLocalCompanyEvents, saveLocalCompanyEvents,
  type CompanyMilestone, type LocalEventImportTarget,
} from "./companyMilestones";

/** 同一账号的通用研究事件与当前标的事件共用存储、同步和解析。 */
export function useLocalCompanyEvents(symbol: string, enabled = true) {
  const [userId, setUserId] = useState("anon");
  const [ready, setReady] = useState(false);
  const [events, setEvents] = useState<CompanyMilestone[]>([]);
  const [allAssetEvents, setAllAssetEvents] = useState<CompanyMilestone[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async r => r.ok ? await r.json() as { user?: { id?: string } } : null)
      .then(j => { if (!cancelled) setUserId(j?.user?.id?.trim() || "anon"); })
      .catch(() => { if (!cancelled) setUserId("anon"); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [enabled]);
  const reload = useCallback(() => {
    setEvents(loadLocalCompanyEvents(userId, symbol));
    setAllAssetEvents(loadLocalCompanyEvents(userId, symbol, "all-assets"));
  }, [userId, symbol]);
  useEffect(() => {
    if (!ready || !enabled) return;
    reload();
    window.addEventListener(LOCAL_EVENTS_CHANGED, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(LOCAL_EVENTS_CHANGED, reload);
      window.removeEventListener("storage", reload);
    };
  }, [reload, ready, enabled]);
  const importEvents = useCallback((items: CompanyMilestone[], target: LocalEventImportTarget) => {
    if (!ready) throw new Error("正在确认当前账号，请稍后重试");
    if (target === "symbol" && !symbol.trim()) throw new Error("请先选择标的，或选择全部资产通用");
    const byId = new Map(loadLocalCompanyEvents(userId, symbol, target).map(m => [m.externalId, m]));
    for (const m of items) byId.set(m.externalId, m);
    saveLocalCompanyEvents(userId, symbol, [...byId.values()], target);
  }, [ready, userId, symbol]);
  const clearAllAssets = useCallback(() => {
    saveLocalCompanyEvents(userId, symbol, [], "all-assets");
  }, [userId, symbol]);
  return { events, allAssetEvents, allAssetCount: allAssetEvents.length, importEvents, clearAllAssets, ready };
}
