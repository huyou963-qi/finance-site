"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const linkBase =
  "rounded-md px-2.5 py-1 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60";

export function SiteHeaderNav() {
  const pathname = usePathname();
  const [me, setMe] = useState<{ username: string; role: "admin" | "user" } | null>(null);
  const macroActive = pathname === "/macro" || pathname === "/";
  const toolsActive = pathname === "/markets-tools" || pathname.startsWith("/markets-tools/");
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

  const doLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/auth";
  };

  return (
    <nav className="flex items-center gap-1">
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
      <Link
        href="/markets-tools"
        className={`${linkBase} ${
          toolsActive
            ? "bg-emerald-950/70 text-emerald-100 ring-1 ring-emerald-700/80"
            : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-100"
        }`}
        aria-current={toolsActive ? "page" : undefined}
      >
        区间工具
      </Link>
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
