"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FinovaWordmark } from "@/components/brand/FinovaWordmark";

function MiniChart({ className }: { className?: string }) {
  return (
    <svg className={className} width="100%" height="72" viewBox="0 0 320 72" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points="0,58 40,52 80,44 120,48 160,28 200,32 240,18 280,22 320,8"
      />
      <line x1="0" y1="58" x2="320" y2="58" stroke="currentColor" strokeOpacity="0.15" />
    </svg>
  );
}

type Me = { username: string; role: "admin" | "user" };

export function HomeLanding() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { user?: Me };
      })
      .then((j) => setMe(j?.user ?? null))
      .catch(() => setMe(null));
  }, []);

  const navLink = "text-sm text-fs-secondary transition hover:text-fs-text";
  const isAdmin = me?.role === "admin";

  return (
    <div className="flex min-h-full flex-1 flex-col w-full">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <Link href="/" className="shrink-0">
          <FinovaWordmark size="sm" />
        </Link>
        <nav className="flex flex-wrap items-center gap-4">
          <Link href="/macro" className={navLink}>
            宏观
          </Link>
          {isAdmin ? (
            <Link href="/markets" className={navLink}>
              行情
            </Link>
          ) : null}
          <Link href="/weekly" className={navLink}>
            AI周度观察
          </Link>
          <Link
            href="/auth"
            className="rounded-md bg-fs-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            {me ? `账户:${me.username}` : "登录"}
          </Link>
        </nav>
      </header>

      <section className="pt-6 md:pt-8 pb-4 md:pb-6">
        <FinovaWordmark size="hero" className="mb-6 md:mb-8" />
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-fs-text md:text-5xl lg:text-6xl">
          全球资本市场的
          <br className="hidden sm:block" />
          智能研究平台
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-fs-secondary md:text-lg">
          宏观仪表盘、多资产行情与 AI 周度观察集中在一处——界面克制、数据严谨，
          帮你在噪音里看清结构与节奏。
        </p>
        <div className="mt-8 flex flex-wrap gap-3 md:mt-10">
          <Link
            href="/macro"
            className="rounded-md bg-fs-accent px-4 py-2 text-sm font-medium text-white md:px-5 md:py-2.5"
          >
            进入宏观
          </Link>
          <Link
            href="/weekly"
            className="rounded-md border border-fs-border px-4 py-2 text-sm font-medium text-fs-text hover:bg-fs-elevated md:px-5 md:py-2.5"
          >
            查看周度观察
          </Link>
        </div>
      </section>

      <div className="shrink-0 space-y-6 pb-2 md:space-y-8 mt-2 md:mt-3">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "宏观序列", value: "2,400+" },
            { label: "多资产行情", value: "实时" },
            { label: "AI 简报", value: "每周" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-fs-border bg-fs-elevated p-4 md:p-5">
              <div className="text-2xl font-semibold text-fs-text md:text-3xl">{s.value}</div>
              <div className="mt-1 text-sm text-fs-text">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-fs-border p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-2 md:items-center">
            <div>
              <h3 className="text-lg font-semibold text-fs-text">跨资产视角，一眼把握</h3>
              <p className="mt-2 text-sm leading-relaxed text-fs-secondary md:text-base">
                CPI、利率、流动性与持仓信号——同一工作区呈现，减少切换与拼凑成本。
              </p>
            </div>
            <MiniChart className="text-fs-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}
