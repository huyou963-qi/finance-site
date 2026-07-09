"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

export const TICKER_ITEMS = [
  "US CPI YoY · 3.2%",
  "10Y UST · 4.28%",
  "Fed Funds · 5.33%",
  "SPX · +0.42%",
  "VIX · 13.8",
  "AI Brief · 已更新",
  "M2 YoY · +2.1%",
  "DXY · 104.2",
  "XLK · +1.05%",
  "原油 WTI · 78.4",
];

export const PILLARS = [
  {
    tag: "AI",
    title: "智能解读",
    desc: "周度观察与结构化摘要，从海量信息流里提取可执行洞察。",
    metric: "每周更新",
    icon: (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden>
        <circle cx="24" cy="24" r="6" fill="currentColor" opacity="0.9" />
        <circle cx="24" cy="24" r="12" fill="none" stroke="currentColor" strokeOpacity="0.25" />
        <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeOpacity="0.12" />
        <line x1="24" y1="6" x2="24" y2="14" stroke="currentColor" strokeOpacity="0.35" />
        <line x1="24" y1="34" x2="24" y2="42" stroke="currentColor" strokeOpacity="0.35" />
        <line x1="6" y1="24" x2="14" y2="24" stroke="currentColor" strokeOpacity="0.35" />
        <line x1="34" y1="24" x2="42" y2="24" stroke="currentColor" strokeOpacity="0.35" />
      </svg>
    ),
  },
  {
    tag: "FINANCE",
    title: "跨资产研究",
    desc: "宏观序列、利率曲线与多市场行情同屏联动，减少上下文切换。",
    metric: "2,400+ 序列",
    icon: (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points="4,36 14,28 22,32 30,18 38,22 44,10"
        />
        <line x1="4" y1="40" x2="44" y2="40" stroke="currentColor" strokeOpacity="0.2" />
      </svg>
    ),
  },
  {
    tag: "DATA",
    title: "数据驱动",
    desc: "可验证来源、调度更新与观测日志——每个结论都能回溯到原始序列。",
    metric: "实时 / 定时",
    icon: (
      <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden>
        <rect x="8" y="10" width="32" height="28" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.35" />
        <line x1="14" y1="18" x2="34" y2="18" stroke="currentColor" strokeOpacity="0.5" />
        <line x1="14" y1="24" x2="28" y2="24" stroke="currentColor" strokeOpacity="0.35" />
        <line x1="14" y1="30" x2="32" y2="30" stroke="currentColor" strokeOpacity="0.35" />
        <circle cx="36" cy="30" r="3" fill="currentColor" />
      </svg>
    ),
  },
] as const;

export function useCountUp(target: number, durationMs = 1400) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

export function StatBlock({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  const n = useCountUp(value);
  return (
    <div className="lp-card-glow rounded-xl border border-fs-border/80 bg-white/70 p-5 backdrop-blur-sm md:p-6">
      <div className="font-mono text-3xl font-semibold tabular-nums text-fs-text md:text-4xl">
        {n.toLocaleString()}
        {suffix}
      </div>
      <div className="mt-1.5 text-sm text-fs-secondary">{label}</div>
    </div>
  );
}

export function LandingTicker() {
  const ticker = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="overflow-hidden border-b border-fs-border/60 bg-fs-elevated/80 py-2.5">
      <div className="lp-ticker-track flex w-max gap-8 whitespace-nowrap px-4 font-mono text-xs text-fs-secondary">
        {ticker.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-2">
            <span className="text-fs-accent">▸</span>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LandingPillarsSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-20 lg:px-14">
      <div className="mb-10 max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fs-accent-text">Core pillars</p>
        <h2 className="mt-2 text-2xl font-semibold text-fs-text md:text-3xl">AI · Finance · Data</h2>
        <p className="mt-3 text-sm leading-relaxed text-fs-secondary md:text-base">
          三条主线构成 Finova 的研究闭环——从原始数据到跨资产视角，再到 AI 辅助解读。
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {PILLARS.map((p) => (
          <article
            key={p.tag}
            className="lp-card-glow group relative overflow-hidden rounded-2xl border border-fs-border bg-white p-6 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_48px_rgba(35,131,226,0.1)] md:p-7"
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-fs-accent/[0.06] blur-2xl transition group-hover:bg-fs-accent/[0.1]" />
            <div className="relative text-fs-accent">{p.icon}</div>
            <p className="relative mt-4 font-mono text-[11px] tracking-[0.16em] text-fs-accent-text">{p.tag}</p>
            <h3 className="relative mt-1 text-lg font-semibold text-fs-text">{p.title}</h3>
            <p className="relative mt-2 text-sm leading-relaxed text-fs-secondary">{p.desc}</p>
            <p className="relative mt-4 inline-flex rounded-md bg-fs-accent-soft px-2.5 py-1 font-mono text-xs text-fs-accent-text">
              {p.metric}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LandingStatsSection() {
  return (
    <section className="border-t border-fs-border/60 bg-gradient-to-b from-white to-fs-accent-soft/25">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 md:grid-cols-3 md:px-10 md:py-16 lg:px-14">
        <StatBlock label="宏观观测序列" value={2400} suffix="+" />
        <StatBlock label="数据源连接器" value={12} />
        <StatBlock label="AI 简报周期（天）" value={7} />
      </div>
    </section>
  );
}

export function LandingFooter({ variantLabel }: { variantLabel: string }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-20 lg:px-14">
      <div className="lp-card-glow relative overflow-hidden rounded-2xl border border-fs-border bg-white/80 p-8 backdrop-blur-sm md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(35,131,226,0.08),transparent_45%)]" />
        <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-fs-accent-text">Preview · {variantLabel}</p>
            <h2 className="mt-2 text-2xl font-semibold text-fs-text md:text-3xl">在噪音里，看见结构</h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-fs-secondary md:text-base">
              设计预览稿，用于对比动效与视觉方向。确认后可合并至正式首页。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-lg border border-fs-border px-5 py-2.5 text-sm font-medium text-fs-text hover:bg-fs-elevated"
            >
              返回正式首页
            </Link>
            <Link
              href="/macro"
              className="rounded-lg bg-fs-accent px-5 py-2.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(35,131,226,0.22)]"
            >
              开始探索
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HeroVizShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`lp-fade-up lp-fade-up-2 relative min-h-[52vh] w-full overflow-hidden rounded-2xl border border-fs-border/70 bg-white/45 shadow-[0_24px_80px_rgba(35,131,226,0.08)] backdrop-blur-md md:min-h-[62vh] lg:min-h-[72vh] ${className}`}
    >
      {children}
    </div>
  );
}
