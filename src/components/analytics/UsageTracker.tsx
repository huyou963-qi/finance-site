"use client";

import { useEffect, useRef } from "react";
import { useLocalePathname } from "@/i18n/navigation";
import { isTrackedPath } from "@/lib/analytics/baiduTongji";
import {
  GUEST_ANALYTICS_COOKIE,
  USAGE_HEARTBEAT_MS,
  USAGE_SESSION_STORAGE_KEY,
} from "@/lib/analytics/usageTypes";
import { randomUUID } from "@/lib/randomId";

type PendingEvent = {
  kind: "page_view" | "heartbeat" | "session_end";
  sessionId: string;
  guestId: string;
  path: string;
  activeMs: number;
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

function ensureGuestId(): string {
  const existing = readCookie(GUEST_ANALYTICS_COOKIE);
  if (existing && /^[A-Za-z0-9_-]+$/.test(existing) && existing.length <= 64) return existing;
  const id = randomUUID().replace(/-/g, "");
  const maxAge = 60 * 60 * 24 * 400;
  document.cookie = `${GUEST_ANALYTICS_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  return id;
}

function ensureSessionId(): string {
  try {
    const existing = sessionStorage.getItem(USAGE_SESSION_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]+$/.test(existing)) return existing;
    const id = randomUUID().replace(/-/g, "");
    sessionStorage.setItem(USAGE_SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return randomUUID().replace(/-/g, "");
  }
}

function sendEvents(events: PendingEvent[], preferBeacon: boolean) {
  if (!events.length) return;
  const body = JSON.stringify({ events });
  if (preferBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/analytics/collect", blob)) return;
  }
  void fetch("/api/analytics/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {});
}

/**
 * 产品使用埋点：路由 PV + 可见时 30s 心跳 + 隐藏/离开时 session_end。
 * 不采集 /admin、/api；失败静默。
 */
export function UsageTracker() {
  const pathname = useLocalePathname();
  const lastPath = useRef<string | null>(null);
  const sessionIdRef = useRef<string>("");
  const guestIdRef = useRef<string>("");
  const pathRef = useRef<string>("/");
  const activeStartedAt = useRef<number | null>(null);
  const pendingMs = useRef(0);

  useEffect(() => {
    sessionIdRef.current = ensureSessionId();
    guestIdRef.current = ensureGuestId();

    const flushActive = (kind: "heartbeat" | "session_end", preferBeacon: boolean) => {
      const path = pathRef.current;
      if (!isTrackedPath(path)) {
        activeStartedAt.current = null;
        pendingMs.current = 0;
        return;
      }
      let ms = pendingMs.current;
      if (activeStartedAt.current != null) {
        ms += Math.max(0, Date.now() - activeStartedAt.current);
      }
      activeStartedAt.current = document.visibilityState === "visible" ? Date.now() : null;
      pendingMs.current = 0;
      if (ms <= 0 && kind === "heartbeat") return;
      sendEvents(
        [
          {
            kind,
            sessionId: sessionIdRef.current,
            guestId: guestIdRef.current,
            path,
            activeMs: Math.min(ms, 5 * 60_000),
          },
        ],
        preferBeacon,
      );
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushActive("session_end", true);
      } else if (document.visibilityState === "visible") {
        activeStartedAt.current = Date.now();
      }
    };

    const onPageHide = () => flushActive("session_end", true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    if (document.visibilityState === "visible") {
      activeStartedAt.current = Date.now();
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      flushActive("heartbeat", false);
    }, USAGE_HEARTBEAT_MS);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      flushActive("session_end", true);
    };
  }, []);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;
    pathRef.current = pathname;
    if (!isTrackedPath(pathname)) return;
    if (!sessionIdRef.current) sessionIdRef.current = ensureSessionId();
    if (!guestIdRef.current) guestIdRef.current = ensureGuestId();
    sendEvents(
      [
        {
          kind: "page_view",
          sessionId: sessionIdRef.current,
          guestId: guestIdRef.current,
          path: pathname,
          activeMs: 0,
        },
      ],
      false,
    );
    if (document.visibilityState === "visible") {
      activeStartedAt.current = Date.now();
      pendingMs.current = 0;
    }
  }, [pathname]);

  return null;
}
