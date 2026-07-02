"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CommonLinksMenu } from "@/components/CommonLinksMenu";
import { UserAccountMenu } from "@/components/UserAccountMenu";

const linkBase =
  "rounded-md px-2.5 py-1 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-fs-accent/50";

const TOOL_LINKS = [
  { href: "/markets-tools", label: "K线区间统计" },
  { href: "/tools/statistical-analysis", label: "统计分析" },
  { href: "/tools/futures-positions", label: "期货持仓报告" },
] as const;

function isToolPath(pathname: string): boolean {
  return TOOL_LINKS.some(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
  );
}

export function SiteHeaderNav() {
  const pathname = usePathname();
  const [me, setMe] = useState<{ username: string; role: "admin" | "user" } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);

  const dashboardActive = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const macroActive = pathname === "/macro";
  const eventsActive = pathname === "/events" || pathname.startsWith("/events/");
  const weeklyActive = pathname === "/weekly" || pathname.startsWith("/weekly/");
  const toolsActive = isToolPath(pathname);
  const marketsActive =
    (pathname === "/markets" || pathname.startsWith("/markets/")) && !toolsActive;

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { user?: { username: string; role: "admin" | "user" } };
      })
      .then((j) => setMe(j?.user ?? null))
      .catch(() => setMe(null));
  }, [pathname]);

  useEffect(() => {
    setToolsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!toolsOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [toolsOpen]);

  const isAdmin = me?.role === "admin";

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {isAdmin ? (
          <Link
            href="/dashboard"
            className={`${linkBase} ${
              dashboardActive
                ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
                : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
            }`}
            aria-current={dashboardActive ? "page" : undefined}
          >
            Dashboard
          </Link>
        ) : null}
        <Link
          href="/macro"
          className={`${linkBase} ${
            macroActive
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
              : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
          }`}
          aria-current={macroActive ? "page" : undefined}
        >
          宏观
        </Link>
        {isAdmin ? (
          <Link
            href="/markets"
            className={`${linkBase} ${
              marketsActive
                ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
                : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
            }`}
            aria-current={marketsActive ? "page" : undefined}
          >
            行情
          </Link>
        ) : null}
        {isAdmin ? (
          <Link
            href="/events"
            className={`${linkBase} ${
              eventsActive
                ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
                : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
            }`}
            aria-current={eventsActive ? "page" : undefined}
          >
            事件
          </Link>
        ) : null}
        <Link
          href="/weekly"
          className={`${linkBase} ${
            weeklyActive
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
              : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
          }`}
          aria-current={weeklyActive ? "page" : undefined}
        >
          AI周度观察
        </Link>
        {isAdmin ? (
          <div ref={toolsRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((v) => !v)}
              className={`${linkBase} ${
                toolsActive
                  ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
                  : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
              }`}
            >
              工具
              <span className="ml-0.5 text-[10px] opacity-70" aria-hidden>
                ▾
              </span>
            </button>
            {toolsOpen ? (
              <div
                role="menu"
                className="absolute left-0 top-full z-50 mt-1 min-w-[9.5rem] rounded-md border border-fs-border bg-fs-elevated py-1 shadow-lg"
              >
                {TOOL_LINKS.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      className={`block px-3 py-1.5 text-sm transition ${
                        active
                          ? "bg-fs-accent-soft text-fs-accent-text"
                          : "text-fs-text hover:bg-fs-elevated hover:text-fs-text"
                      }`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setToolsOpen(false)}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        {isAdmin ? <CommonLinksMenu me={me} /> : null}
      </div>
      <UserAccountMenu />
    </nav>
  );
}
