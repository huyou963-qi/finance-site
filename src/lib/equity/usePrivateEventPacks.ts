"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocalEventPack } from "./localEventPacks";
type Snapshot = { userId: string; packs: { pack: LocalEventPack; revision: number; updatedAt: string }[]; credentials: { packId: string; expiresAt: string }[] };
export function usePrivateEventPacks(userId: string, enabled: boolean, onAccountChange: (id: string) => void) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncedAt, setSyncedAt] = useState("");
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async () => {
    const seq = ++sequence.current;
    if (!enabled || userId === "anon") return;
    setLoading(true);
    try {
      const response = await fetch("/api/user/event-packs", { cache: "no-store" });
      const data = await response.json();
      if (seq !== sequence.current) return;
      if (response.status === 401) { setSnapshot(null); onAccountChange("anon"); return; }
      if (!response.ok) throw new Error(data.error || "云端事件同步失败");
      if (data.userId !== userId) { setSnapshot(null); onAccountChange(data.userId); return; }
      setSnapshot(data); setError(""); setSyncedAt(new Date().toISOString());
    } catch (e) { if (seq === sequence.current) setError(e instanceof Error ? e.message : "云端事件同步失败"); }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [enabled, userId, onAccountChange]);
  useEffect(() => {
    void refresh();
    const wake = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(wake, 30000);
    window.addEventListener("focus", wake); document.addEventListener("visibilitychange", wake);
    return () => { invalidate(); clearInterval(timer); window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); };
  }, [refresh, invalidate]);
  const current = enabled && userId !== "anon" && snapshot?.userId === userId ? snapshot : null;
  const packs = useMemo(() => (current?.packs ?? []).map(row => ({ ...row.pack, storage: "cloud" as const, revision: row.revision })), [current]);
  return { userId, packs, credentials: current?.credentials ?? [], error, loading, syncedAt: current ? syncedAt : "", refresh };
}
