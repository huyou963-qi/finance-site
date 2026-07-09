"use client";

import { FinovaWordmark } from "@/components/brand/FinovaWordmark";
import { AuroraFlowCanvas } from "@/components/landing-preview/AuroraFlowCanvas";
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
  { label: "AI 引擎", value: "ON" },
  { label: "数据流", value: "LIVE" },
  { label: "延迟", value: "12ms" },
];

export function LandingPreviewNebula() {
  return (
    <div className="lp-root -mx-6 -mt-3 overflow-hidden md:-mx-10 lg:-mx-14 xl:-mx-20">
      <section className="relative min-h-[88vh] border-b border-fs-border/60">
        <div className="lp-nebula-bg absolute inset-0" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-6 pt-8 md:px-10 md:pt-12 lg:px-14">
          <div className="lp-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-fs-accent/25 bg-white/70 px-3 py-1 text-xs font-medium text-fs-accent-text backdrop-blur-sm">
            <span className="lp-live-dot inline-block h-1.5 w-1.5 rounded-full bg-fs-accent" />
            V6 · 星云 · 极光增强
          </div>
          <div className="lp-fade-up lp-fade-up-1 mb-6 md:mb-8">
            <FinovaWordmark size="hero" />
          </div>
        </div>

        <div className="relative px-4 pb-16 md:px-8 md:pb-20 lg:px-12 lg:pb-24">
          <HeroVizShell className="overflow-hidden border-fs-accent/25 bg-white/25 shadow-[0_40px_120px_rgba(35,131,226,0.18)]">
            <AuroraFlowCanvas />
            <div className="lp-nebula-vignette pointer-events-none absolute inset-0" aria-hidden />

            <div className="lp-pulse-rings pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              {[1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="lp-pulse-ring lp-pulse-ring-slow absolute rounded-full border border-[#5eb3ff]/20"
                  style={{ width: `${i * 18}%`, height: `${i * 12}%`, animationDelay: `${i * 0.7}s` }}
                />
              ))}
            </div>

            <div className="relative flex min-h-[52vh] flex-col items-center justify-center p-8 md:min-h-[62vh] md:p-12 lg:min-h-[72vh]">
              <div className="lp-nebula-core relative mb-10 flex h-32 w-32 items-center justify-center rounded-full md:h-40 md:w-40">
                <span className="absolute inset-0 rounded-full bg-fs-accent/20 blur-xl" />
                <span className="relative font-mono text-sm uppercase tracking-[0.25em] text-fs-accent-text md:text-base">
                  AI · DATA
                </span>
              </div>

              <svg viewBox="0 0 600 160" className="w-full max-w-4xl" aria-hidden>
                <defs>
                  <linearGradient id="nebula-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#5eb3ff" stopOpacity="0" />
                    <stop offset="30%" stopColor="#2383e2" />
                    <stop offset="70%" stopColor="#5eb3ff" />
                    <stop offset="100%" stopColor="#2383e2" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  className="lp-nebula-wave"
                  d="M0,100 C80,80 160,120 240,70 S400,130 480,60 S560,90 600,75"
                  fill="none"
                  stroke="url(#nebula-line)"
                  strokeWidth="3"
                />
                <path
                  className="lp-nebula-wave lp-nebula-wave-b"
                  d="M0,115 C100,95 200,125 300,85 S450,115 550,95 600,88"
                  fill="none"
                  stroke="rgba(35,131,226,0.25)"
                  strokeWidth="1.5"
                />
              </svg>

              <div className="mt-10 grid w-full max-w-4xl grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                {METRICS.map((m) => (
                  <div
                    key={m.label}
                    className="lp-nebula-chip rounded-xl border border-white/50 bg-white/40 px-4 py-3 text-center backdrop-blur-md"
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
      <LandingFooter variantLabel="星云 · 极光增强" />
    </div>
  );
}
