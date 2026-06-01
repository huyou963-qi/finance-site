"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const linkBase =
  "rounded-md px-2.5 py-1 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60";

const TOOL_LINKS = [
  { href: "/markets-tools", label: "K线区间统计" },
  { href: "/tools/statistical-analysis", label: "统计分析" },
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
  const macroActive = pathname === "/macro" || pathname === "/";
  const toolsActive = isToolPath(pathname);
  const authActive = pathname === "/auth" || pathname.startsWith("/auth/");
  const adminActive = pathname === "/admin/users" || pathname.startsWith("/admin/users/");
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

  const doLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/auth";
  };

  return (
    <nav className="flex items-center gap-1">
      <Link
        href="/dashboard"
        className={`${linkBase} ${
          dashboardActive
            ? "bg-emerald-950/70 text-emerald-100 ring-1 ring-emerald-700/80"
            : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-100"
        }`}
        aria-current={dashboardActive ? "page" : undefined}
      >
        Dashboard
      </Link>
      <Link
        href="/macro"
        className={`${linkBase} ${
          macroActive
            ? "bg-emerald-950/70 text-emerald-100 ring-1 ring-emerald-700/80"
            : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-100"
        }`}
        aria-current={macroActive ? "page" : undefined}
      >
        宏观
      </Link>
      <Link
        href="/markets"
        className={`${linkBase} ${
          marketsActive
            ? "bg-emerald-950/70 text-emerald-100 ring-1 ring-emerald-700/80"
            : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-100"
        }`}
        aria-current={marketsActive ? "page" : undefined}
      >
        K 线
      </Link>
      <div ref={toolsRef} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((v) => !v)}
          className={`${linkBase} ${
            toolsActive
              ? "bg-emerald-950/70 text-emerald-100 ring-1 ring-emerald-700/80"
              : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-100"
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
            className="absolute left-0 top-full z-50 mt-1 min-w-[9.5rem] rounded-md border border-slate-700 bg-slate-900 py-1 shadow-lg"
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
                      ? "bg-emerald-950/50 text-emerald-100"
                      : "text-slate-200 hover:bg-slate-800 hover:text-white"
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
      {me?.role === "admin" ? (
        <Link
          href="/admin/users"
          className={`${linkBase} ${
            adminActive
              ? "bg-emerald-950/70 text-emerald-100 ring-1 ring-emerald-700/80"
              : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-100"
          }`}
          aria-current={adminActive ? "page" : undefined}
        >
          管理员
        </Link>
      ) : null}
      <Link
        href="/auth"
        className={`${linkBase} ${
          authActive
            ? "bg-emerald-950/70 text-emerald-100 ring-1 ring-emerald-700/80"
            : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-100"
        }`}
        aria-current={authActive ? "page" : undefined}
      >
        {me ? `账户:${me.username}` : "登录"}
      </Link>
      {me ? (
        <button
          type="button"
          onClick={() => doLogout().catch(() => {})}
          className={`${linkBase} text-slate-400 hover:bg-slate-900/80 hover:text-slate-100`}
        >
          退出
        </button>
      ) : null}
    </nav>
  );
}
