"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CommonLinksMenu } from "@/components/CommonLinksMenu";
import { ReportBugButton } from "@/components/errors/ReportBugButton";
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

  const macroFrameworkActive =
    pathname === "/macro/framework" || pathname.startsWith("/macro/framework/");
  const macroActive = pathname === "/macro";
  const cpiSubitemsActive =
    pathname === "/macro/cpi-subitems" || pathname.startsWith("/macro/cpi-subitems/");
  const eventsActive = pathname === "/events" || pathname.startsWith("/events/");
  const weeklyActive = pathname === "/weekly" || pathname.startsWith("/weekly/");
  const equityActive =
    pathname === "/equity/sectors" || pathname.startsWith("/equity/sectors/");
  const screenerActive =
    pathname === "/equity/screener" || pathname.startsWith("/equity/screener/");
  const backtestActive =
    pathname === "/equity/backtest" || pathname.startsWith("/equity/backtest/");
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
        <Link
          href="/macro/framework"
          className={`${linkBase} ${
            macroFrameworkActive
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
              : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
          }`}
          aria-current={macroFrameworkActive ? "page" : undefined}
        >
          宏观框架
        </Link>
        <Link
          href="/macro"
          className={`${linkBase} ${
            macroActive
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
              : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
          }`}
          aria-current={macroActive ? "page" : undefined}
        >
          宏观数据
        </Link>
        <Link
          href="/macro/cpi-subitems"
          className={`${linkBase} ${
            cpiSubitemsActive
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
              : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
          }`}
          aria-current={cpiSubitemsActive ? "page" : undefined}
        >
          CPI分项
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
        <Link
          href="/equity/sectors"
          className={`${linkBase} ${
            equityActive
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
              : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
          }`}
          aria-current={equityActive ? "page" : undefined}
        >
          美股行业
        </Link>
        <Link
          href="/equity/screener"
          className={`${linkBase} ${
            screenerActive
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
              : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
          }`}
          aria-current={screenerActive ? "page" : undefined}
        >
          选股器
        </Link>
        <Link
          href="/equity/backtest"
          className={`${linkBase} ${
            backtestActive
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
              : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
          }`}
          aria-current={backtestActive ? "page" : undefined}
        >
          回测
        </Link>
        <Link
          href="/events"
          className={`${linkBase} ${
            eventsActive
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
              : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
          }`}
          aria-current={eventsActive ? "page" : undefined}
        >
          时间线
        </Link>
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
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <ReportBugButton />
        <UserAccountMenu />
      </div>
    </nav>
  );
}
