"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { baiduTongjiId } from "@/lib/analytics/baiduTongji";
import { isTrackedPath } from "@/lib/analytics/pageView";

const ENDPOINT = "/api/analytics/pageview";
const BAIDU_TONGJI_ENABLED = baiduTongjiId() !== null;

type HmtWindow = Window & { _hmt?: { push: (cmd: unknown[]) => unknown } };

/** 百度统计 PV；队列若由这里先建，也要先关自动 PV（hm.js 可能尚未注入） */
function trackBaidu(path: string) {
  if (!BAIDU_TONGJI_ENABLED) return;
  const w = window as HmtWindow;
  const queue = (w._hmt ??= [["_setAutoPageview", false]] as unknown[][]);
  queue.push(["_trackPageview", path]);
}
const VISITOR_KEY = "fs_analytics_vid";
const SESSION_KEY = "fs_analytics_session";
const SESSION_IDLE_MS = 30 * 60_000;

/** localStorage 不可用时（隐私模式等）退回内存，至少同一页面生命周期内 ID 稳定 */
const memory = new Map<string, string>();

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeStorage(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 仅内存
  }
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getVisitorId(): string {
  const existing = readStorage(VISITOR_KEY);
  if (existing) return existing;
  const id = randomId();
  writeStorage(VISITOR_KEY, id);
  return id;
}

/** 续期当前会话；超过 30 分钟无活动则开新会话（isEntry=true） */
function touchSession(): { id: string; isEntry: boolean } {
  const now = Date.now();
  const raw = readStorage(SESSION_KEY);
  if (raw) {
    try {
      const s = JSON.parse(raw) as { id?: unknown; last?: unknown };
      if (typeof s.id === "string" && typeof s.last === "number" && now - s.last < SESSION_IDLE_MS) {
        writeStorage(SESSION_KEY, JSON.stringify({ id: s.id, last: now }));
        return { id: s.id, isEntry: false };
      }
    } catch {
      // 损坏则重建
    }
  }
  const id = randomId();
  writeStorage(SESSION_KEY, JSON.stringify({ id, last: now }));
  return { id, isEntry: true };
}

function send(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // 退回 fetch
  }
  void fetch(ENDPOINT, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => {});
}

/** 每次路由切换上报一次页面浏览（自建统计 + 百度统计；挂在根 layout）。 */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;
    if (!isTrackedPath(pathname)) return;
    trackBaidu(pathname);
    const session = touchSession();
    send({
      path: pathname,
      visitorId: getVisitorId(),
      sessionId: session.id,
      isEntry: session.isEntry,
      referrer: session.isEntry ? document.referrer : undefined,
    });
  }, [pathname]);

  return null;
}
