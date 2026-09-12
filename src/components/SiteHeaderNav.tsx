"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CommonLinksMenu } from "@/components/CommonLinksMenu";
import { ReportBugButton } from "@/components/errors/ReportBugButton";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { useVisibleFeatures } from "@/hooks/useVisibleFeatures";

const linkBase =
  "rounded-md px-2.5 py-1 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-fs-accent/50";

const TOOL_LINKS = [
  { href: "/markets-tools", label: "K线区间统计", featureId: "tools-kline-range" },
  {
    href: "/tools/statistical-analysis",
    label: "统计分析",
    featureId: "tools-statistical-analysis",
  },
  {
    href: "/tools/futures-positions",
    label: "期货持仓报告",
    featureId: "tools-futures-positions",
  },
] as const;

/** 量化下的分页：顶栏「量化」入口指向第一个可见项 */
const QUANT_LINKS = [
  { href: "/quant/regime", featureId: "quant-regime" },
  { href: "/quant/factor-research", featureId: "quant-factor-research" },
  { href: "/quant/screener", featureId: "quant-screener" },
  { href: "/quant/backtest", featureId: "quant-backtest" },
  { href: "/quant/robustness", featureId: "quant-robustness" },
] as const;

/** 顶栏主入口：featureId 由管理员在 /admin/feature-access 控制可见性 */
const MAIN_LINKS = [
  { featureId: "macro", href: "/macro", label: "宏观数据", match: ["/macro"] },
  {
    featureId: "equity-sectors",
    href: "/equity/sectors",
    label: "美股行业",
    match: ["/equity/sectors"],
  },
  {
    featureId: "equity-ownership",
    href: "/equity/ownership",
    label: "持股监控",
    match: ["/equity/ownership"],
  },
  { featureId: "markets", href: "/markets", label: "行情", match: ["/markets", "/equity/stocks"] },
  {
    featureId: "investments",
    href: "/investments",
    label: "投资记录",
    match: ["/investments"],
  },
  { featureId: "events", href: "/events", label: "时间线", match: ["/events"] },
  { featureId: "weekly", href: "/weekly", label: "AI周度观察", match: ["/weekly"] },
] as const;

const QUANT_MATCH = [
  "/quant",
  "/equity/screener",
  "/equity/backtest",
  "/equity/robustness",
  "/equity/factor-research",
  "/equity/regime",
] as const;

function matchesAny(pathname: string, bases: readonly string[]): boolean {
  return bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));
}

export function SiteHeaderNav() {
  const pathname = usePathname();
  const [me, setMe] = useState<{ username: string; role: "admin" | "user" } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const features = useVisibleFeatures();

  const macroFrameworkActive = matchesAny(pathname, ["/macro/framework"]);
  const articlesActive = matchesAny(pathname, ["/articles"]);
  const quantActive = matchesAny(pathname, QUANT_MATCH);
  const visibleTools = TOOL_LINKS.filter((t) => features.can(t.featureId));
  const toolsActive = matchesAny(
    pathname,
    TOOL_LINKS.map((t) => t.href),
  );
  const quantHref = QUANT_LINKS.find((q) => features.can(q.featureId))?.href ?? null;

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

  const linkClass = (active: boolean) =>
    `${linkBase} ${
      active
        ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
        : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
    }`;

  // 宏观数据 / 美股行业 之间要插入其余主入口，保持原有顺序：宏观、美股行业、持股监控、
  // 行情、投资记录、量化、时间线、AI周度观察、文章。
  const beforeQuant = MAIN_LINKS.slice(0, 5);
  const afterQuant = MAIN_LINKS.slice(5);

  const renderMain = (items: readonly (typeof MAIN_LINKS)[number][]) =>
    items
      .filter((item) => features.can(item.featureId))
      .map((item) => {
        const active = matchesAny(pathname, item.match);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={linkClass(active)}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      });

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {features.can("macro-framework") ? (
          <Link
            href="/macro/framework"
            className={linkClass(macroFrameworkActive)}
            aria-current={macroFrameworkActive ? "page" : undefined}
          >
            宏观框架
          </Link>
        ) : null}
        {renderMain(beforeQuant)}
        {quantHref ? (
          <Link
            href={quantHref}
            className={linkClass(quantActive)}
            aria-current={quantActive ? "page" : undefined}
          >
            量化
          </Link>
        ) : null}
        {renderMain(afterQuant)}
        {features.can("articles") || isAdmin ? (
          <Link
            href={isAdmin ? "/articles/editor" : "/articles"}
            className={linkClass(articlesActive)}
            aria-current={articlesActive ? "page" : undefined}
          >
            {isAdmin ? "发布文章" : "专题文章"}
          </Link>
        ) : null}
        {visibleTools.length > 0 ? (
          <div ref={toolsRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((v) => !v)}
              className={linkClass(toolsActive)}
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
                {visibleTools.map((item) => {
                  const active = matchesAny(pathname, [item.href]);
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
        <Link
          href="/pricing"
          className={linkClass(matchesAny(pathname, ["/pricing"]))}
        >
          Pro
        </Link>
        <ReportBugButton />
        <UserAccountMenu />
      </div>
    </nav>
  );
}
