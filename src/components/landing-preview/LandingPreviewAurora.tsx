"use client";

import { FinovaWordmark } from "@/components/brand/FinovaWordmark";
import {
  HeroVizShell,
  LandingFooter,
  LandingPillarsSection,
  LandingStatsSection,
  LandingTicker,
} from "@/components/landing-preview/landing-shared";
import "./landing-preview.css";

const METRICS = [
  { label: "宏观序列", value: "2,400+" },
  { label: "AI 简报", value: "Weekly" },
  { label: "延迟", value: "12ms" },
  { label: "数据源", value: "FRED+" },
];

export function LandingPreviewAurora() {
  return (
    <div className="lp-root -mx-6 -mt-3 overflow-hidden md:-mx-10 lg:-mx-14 xl:-mx-20">
      <section className="relative min-h-[88vh] border-b border-fs-border/60">
        <div className="lp-aurora-bg absolute inset-0" aria-hidden />
        <div className="lp-aurora-blob lp-aurora-blob-a pointer-events-none absolute left-[10%] top-[15%] h-80 w-80 rounded-full opacity-60 blur-3xl" aria-hidden />
        <div className="lp-aurora-blob lp-aurora-blob-b pointer-events-none absolute bottom-[10%] right-[8%] h-96 w-96 rounded-full opacity-50 blur-3xl" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-6 pt-8 md:px-10 md:pt-12 lg:px-14">
          <div className="lp-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-fs-accent/25 bg-white/70 px-3 py-1 text-xs font-medium text-fs-accent-text backdrop-blur-sm">
            <span className="lp-live-dot inline-block h-1.5 w-1.5 rounded-full bg-fs-accent" />
            V2 · 极光流
          </div>
          <div className="lp-fade-up lp-fade-up-1 mb-6 md:mb-8">
            <FinovaWordmark size="hero" />
          </div>
        </div>

        <div className="relative px-4 pb-16 md:px-8 md:pb-20 lg:px-12 lg:pb-24">
          <HeroVizShell className="bg-white/30">
            <div className="lp-pulse-rings pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="lp-pulse-ring absolute rounded-full border border-fs-accent/20"
                  style={{ width: `${i * 22}%`, height: `${i * 14}%`, animationDelay: `${i * 0.6}s` }}
                />
              ))}
            </div>

            <div className="relative flex min-h-[52vh] flex-col items-center justify-center p-8 md:min-h-[62vh] lg:min-h-[72vh]">
              <div className="relative w-full max-w-3xl">
                <svg viewBox="0 0 600 200" className="w-full text-fs-accent" aria-hidden>
                  <defs>
                    <linearGradient id="lp-aurora-line" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#5eb3ff" stopOpacity="0.2" />
                      <stop offset="50%" stopColor="#2383e2" />
                      <stop offset="100%" stopColor="#0b6bcb" stopOpacity="0.2" />
                    </linearGradient>
                    <linearGradient id="lp-aurora-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2383e2" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#2383e2" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    className="lp-aurora-wave-a"
                    d="M0,140 C80,120 120,60 200,80 S320,160 400,90 S520,40 600,70 L600,200 L0,200 Z"
                    fill="url(#lp-aurora-fill)"
                  />
                  <path
                    className="lp-aurora-wave-b"
                    d="M0,150 C100,130 180,100 280,110 S420,170 520,100 S560,80 600,95"
                    fill="none"
                    stroke="url(#lp-aurora-line)"
                    strokeWidth="3"
                  />
                </svg>
              </div>

              <div className="mt-8 grid w-full max-w-4xl grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                {METRICS.map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl border border-white/60 bg-white/50 px-4 py-3 text-center backdrop-blur-md transition hover:border-fs-accent/30 hover:bg-white/70"
                  >
                    <div className="font-mono text-lg font-semibold text-fs-text md:text-xl">{m.value}</div>
                    <div className="mt-0.5 text-xs text-fs-secondary">{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </HeroVizShell>
        </div>
      </section>
      <LandingTicker />
      <LandingPillarsSection />
      <LandingStatsSection />
      <LandingFooter variantLabel="极光流" />
    </div>
  );
}
