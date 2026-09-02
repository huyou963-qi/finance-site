"use client";

import Link from "next/link";
import { FinovaWordmark } from "@/components/brand/FinovaWordmark";
import { MarketGlobe } from "@/components/home/MarketGlobe";
import { useEffect, useState } from "react";

export function HomeLanding() {
  const [macroSeriesCount, setMacroSeriesCount] = useState<string>("—");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/data/instruments?kind=MACRO_SERIES&limit=1", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ total?: number }>;
      })
      .then((payload) => {
        if (typeof payload.total === "number") {
          setMacroSeriesCount(new Intl.NumberFormat("zh-CN").format(payload.total));
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("首页宏观序列数读取失败", error);
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="relative mx-auto flex min-h-full w-full max-w-[1600px] flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute left-[43%] top-[18%] h-80 w-80 rounded-full bg-blue-50/80 blur-3xl" />
      <section className="relative grid flex-1 items-center gap-4 py-3 lg:grid-cols-[0.78fr_1.22fr] lg:gap-0 lg:py-1">
        <div className="relative z-10 max-w-[680px] lg:-translate-y-28 lg:pb-4">
          <div className="mb-7 flex items-center gap-3">
            <FinovaWordmark size="hero" />
            <span className="hidden h-px w-10 bg-slate-200 sm:block" />
            <span className="hidden text-xs font-medium uppercase tracking-[0.2em] text-slate-400 sm:block">GLOBAL INTELLIGENCE</span>
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">实时观察世界资金脉搏</p>
          <h1 className="text-[2.7rem] font-semibold leading-[1.05] tracking-[-0.045em] text-slate-950 sm:text-5xl lg:text-[4.5rem]">
            全球市场，
            <br />
            <span className="text-slate-400">此刻同屏。</span>
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/macro" className="group rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-blue-600">
              进入宏观 <span className="ml-1 inline-block transition group-hover:translate-x-0.5">↗</span>
            </Link>
            <Link href="/weekly" className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
              AI周度观察
            </Link>
          </div>
          <div className="mt-10 grid max-w-lg grid-cols-3 border-t border-slate-200 pt-5">
            {[[macroSeriesCount, "宏观序列"], ["8", "全球市场"], ["每周", "AI 研判"]].map(([value, label]) => (
              <div key={label} className="border-r border-slate-200 last:border-0 first:pr-4 [&:not(:first-child)]:px-4">
                <div className="text-lg font-semibold text-slate-900">{value}</div>
                <div className="mt-0.5 text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative min-h-[460px] lg:min-h-0">
          <MarketGlobe />
          <div className="pointer-events-none absolute right-[4%] top-[13%] hidden text-right xl:block">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">SOLAR POSITION</div>
            <div className="mt-1 text-xs text-slate-500">日夜交界随季节与时间实时更新</div>
          </div>
        </div>
      </section>
    </div>
  );
}
