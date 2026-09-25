"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CommonLinksMenu } from "@/components/CommonLinksMenu";
import { ReportBugButton } from "@/components/errors/ReportBugButton";
import { UserAccountMenu } from "@/components/UserAccountMenu";
import { IconClose, IconMenu } from "@/components/mobile/mobileIcons";
import { useVisibleFeatures } from "@/hooks/useVisibleFeatures";

const linkBase =
  "relative inline-flex min-h-12 items-center px-2.5 text-[15px] font-semibold tracking-[0.025em] transition-colors outline-none after:absolute after:bottom-1 after:left-2.5 after:right-2.5 after:h-0.5 after:rounded-full after:bg-linear-to-r after:from-[#00c8ad] after:to-[#075f78] after:opacity-0 after:transition-opacity focus-visible:ring-2 focus-visible:ring-fs-accent/50 max-md:min-h-10 max-md:rounded-md max-md:text-sm";

const TOOL_LINKS = [
  { href: "/markets-tools", label: "K线区间统计", featureId: "tools-kline-range" },
  {
    href: "/tools/statistical-analysis",
    label: "统计分析",
    featureId: "tools-statistical-analysis",
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

/** 指标预测下的分页：顶栏「指标预测」入口指向第一个可见项 */
const FORECAST_LINKS = [
  { href: "/forecast/us-cpi", featureId: "forecast-us-cpi" },
  { href: "/forecast/us-nfp", featureId: "forecast-us-nfp" },
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

/** 已上线的 Pro 专属功能、当前身份无权时，在入口旁加的小标记 */
function ProMark() {
  return (
    <span className="ml-1 rounded-sm bg-linear-to-r from-[#00c8ad] to-[#075f78] px-1 text-[10px] font-semibold leading-4 tracking-normal text-white">
      Pro
    </span>
  );
}

function matchesAny(pathname: string, bases: readonly string[]): boolean {
  return bases.some((b) => pathname === b || pathname.startsWith(`${b}/`));
}

type MobileNavLink = { href: string; label: string; active: boolean; pro?: boolean };

/** 手机端（< 768px）导航抽屉：顶栏入口收进右侧抽屉 */
function MobileNavDrawer({
  open,
  onClose,
  links,
  toolLinks,
}: {
  open: boolean;
  onClose: () => void;
  links: MobileNavLink[];
  toolLinks: MobileNavLink[];
}) {
  if (!open) return null;

  const row = (item: MobileNavLink) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={onClose}
      aria-current={item.active ? "page" : undefined}
      className={`flex h-12 items-center rounded-lg px-3 text-base transition ${
        item.active
          ? "bg-fs-accent-soft font-semibold text-fs-accent-text"
          : "text-fs-text active:bg-fs-elevated"
      }`}
    >
      {item.label}
      {item.pro ? <ProMark /> : null}
    </Link>
  );

  return createPortal(
    <div className="fixed inset-0 z-[10000] md:hidden">
      <button
        type="button"
        aria-label="关闭菜单"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <nav
        aria-label="站点导航"
        className="absolute inset-y-0 right-0 flex w-[min(300px,calc(100vw-64px))] flex-col bg-fs-bg shadow-2xl"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-fs-border pl-4 pr-1">
          <span className="text-sm font-semibold text-fs-text">导航</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭菜单"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-fs-secondary active:bg-fs-elevated"
          >
            <IconClose size={22} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          <div className="flex flex-col gap-0.5">{links.map(row)}</div>
          {toolLinks.length > 0 ? (
            <>
              <p className="mt-3 px-3 pb-1 text-xs font-medium text-fs-muted">工具</p>
              <div className="flex flex-col gap-0.5">{toolLinks.map(row)}</div>
            </>
          ) : null}
          <div className="mx-3 my-3 h-px bg-fs-border" />
          {row({ href: "/pricing", label: "Pro 会员", active: false })}
        </div>
      </nav>
    </div>,
    document.body,
  );
}

export function SiteHeaderNav() {
  const pathname = usePathname();
  const [me, setMe] = useState<{ username: string; role: "admin" | "user" } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
  const forecastActive = matchesAny(pathname, ["/forecast"]);
  const forecastHref = FORECAST_LINKS.find((f) => features.can(f.featureId))?.href ?? null;

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
    setMobileNavOpen(false);
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
        ? "text-[#062f42] after:opacity-100"
        : "text-fs-muted hover:text-[#062f42]"
    }`;

  // 主入口顺序：宏观、指标预测、美股行业、持股监控、行情、投资记录、量化、时间线、
  // AI周度观察、文章。指标预测与量化是带分页的分组入口，插在对应位置。
  const macroLinks = MAIN_LINKS.slice(0, 1);
  const beforeQuant = MAIN_LINKS.slice(1, 5);
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
            {features.locked(item.featureId) ? <ProMark /> : null}
          </Link>
        );
      });

  const mainMobileLinks = (items: readonly (typeof MAIN_LINKS)[number][]): MobileNavLink[] =>
    items
      .filter((item) => features.can(item.featureId))
      .map((item) => ({
        href: item.href,
        label: item.label,
        active: matchesAny(pathname, item.match),
        pro: features.locked(item.featureId),
      }));

  const mobileLinks: MobileNavLink[] = [
    ...(features.can("macro-framework")
      ? [{ href: "/macro/framework", label: "宏观框架", active: macroFrameworkActive }]
      : []),
    ...mainMobileLinks(macroLinks),
    ...(forecastHref ? [{ href: forecastHref, label: "指标预测", active: forecastActive }] : []),
    ...mainMobileLinks(beforeQuant),
    ...(quantHref ? [{ href: quantHref, label: "量化", active: quantActive }] : []),
    ...mainMobileLinks(afterQuant),
    ...(features.can("articles") || isAdmin
      ? [
          {
            href: isAdmin ? "/articles/editor" : "/articles",
            label: isAdmin ? "发布文章" : "专题文章",
            active: articlesActive,
          },
        ]
      : []),
  ];
  const mobileToolLinks: MobileNavLink[] = visibleTools.map((item) => ({
    href: item.href,
    label: item.label,
    active: matchesAny(pathname, [item.href]),
    pro: features.locked(item.featureId),
  }));

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 max-md:hidden">
        {features.can("macro-framework") ? (
          <Link
            href="/macro/framework"
            className={linkClass(macroFrameworkActive)}
            aria-current={macroFrameworkActive ? "page" : undefined}
          >
            宏观框架
          </Link>
        ) : null}
        {renderMain(macroLinks)}
        {forecastHref ? (
          <Link
            href={forecastHref}
            className={linkClass(forecastActive)}
            aria-current={forecastActive ? "page" : undefined}
          >
            指标预测
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
                      {features.locked(item.featureId) ? <ProMark /> : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        {isAdmin ? <CommonLinksMenu me={me} /> : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 max-md:gap-0.5">
        <Link
          href="/pricing"
          className={linkClass(matchesAny(pathname, ["/pricing"]))}
        >
          Pro
        </Link>
        <ReportBugButton />
        <UserAccountMenu />
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="打开导航菜单"
          aria-expanded={mobileNavOpen}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-fs-secondary active:bg-fs-elevated md:hidden"
        >
          <IconMenu size={22} />
        </button>
      </div>
      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        links={mobileLinks}
        toolLinks={mobileToolLinks}
      />
    </nav>
  );
}
