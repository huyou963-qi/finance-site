"use client";

import { FinovaWordmark } from "@/components/brand/FinovaWordmark";
import { SciFiNodeCanvas } from "@/components/landing-preview/SciFiNodeCanvas";
import {
  HeroVizShell,
  LandingFooter,
  LandingPillarsSection,
  LandingStatsSection,
  LandingTicker,
} from "@/components/landing-preview/landing-shared";
import "./landing-preview.css";

function HudCorner({ className }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute h-4 w-4 border-fs-accent/40 ${className ?? ""}`}
      aria-hidden
    />
  );
}

export function LandingPreviewHud() {
  return (
    <div className="lp-root -mx-6 -mt-3 overflow-hidden md:-mx-10 lg:-mx-14 xl:-mx-20">
      <section className="relative min-h-[88vh] border-b border-fs-border/60">
        <div className="lp-grid-bg absolute inset-0" aria-hidden />
        <div className="lp-orb pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-fs-accent/[0.07] blur-3xl" aria-hidden />
        <div className="lp-orb lp-orb-delay pointer-events-none absolute -right-16 bottom-8 h-64 w-64 rounded-full bg-[#5eb3ff]/[0.09] blur-3xl" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-6 pt-8 md:px-10 md:pt-12 lg:px-14">
          <div className="lp-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-fs-accent/25 bg-fs-accent-soft/80 px-3 py-1 text-xs font-medium text-fs-accent-text backdrop-blur-sm">
            <span className="lp-live-dot inline-block h-1.5 w-1.5 rounded-full bg-fs-accent" />
            V1 · HUD 指挥舱
          </div>
          <div className="lp-fade-up lp-fade-up-1 mb-6 md:mb-8">
            <FinovaWordmark size="hero" />
          </div>
        </div>

        <div className="relative px-4 pb-16 md:px-8 md:pb-20 lg:px-12 lg:pb-24">
          <HeroVizShell>
            <SciFiNodeCanvas />
            <div className="lp-scan-line pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fs-accent/70 to-transparent" />
            <div className="relative flex min-h-[52vh] flex-col justify-between p-8 md:min-h-[62vh] md:p-10 lg:min-h-[72vh] lg:p-12">
              <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.18em] text-fs-accent-text/80 md:text-[13px]">
                <span>finova.sys / live</span>
                <span className="flex items-center gap-1.5">
                  <span className="lp-live-dot h-1.5 w-1.5 rounded-full bg-fs-accent" />
                  streaming
                </span>
              </div>
              <div className="my-6 min-h-[220px] flex-1 md:min-h-[320px] lg:min-h-[420px]">
                <svg viewBox="0 0 400 120" className="h-full min-h-[220px] w-full text-fs-accent md:min-h-[320px] lg:min-h-[420px]" aria-hidden>
                  <defs>
                    <linearGradient id="lp-hud-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2383e2" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#2383e2" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,95 L40,88 80,72 120,76 160,52 200,58 240,38 280,44 320,28 360,32 400,18 L400,120 L0,120 Z" fill="url(#lp-hud-area)" />
                  <polyline className="lp-chart-line" fill="none" stroke="currentColor" strokeWidth="2.5" points="0,95 40,88 80,72 120,76 160,52 200,58 240,38 280,44 320,28 360,32 400,18" />
                </svg>
              </div>
              <div className="grid grid-cols-3 gap-4 font-mono text-sm md:gap-5">
                {[
                  { k: "SIG", v: "risk-on" },
                  { k: "LAT", v: "12ms" },
                  { k: "SRC", v: "FRED+" },
                ].map((item) => (
                  <div key={item.k} className="rounded-lg border border-fs-border/60 bg-white/55 px-3 py-3 backdrop-blur-sm md:px-4 md:py-3.5">
                    <div className="text-[11px] text-fs-muted md:text-xs">{item.k}</div>
                    <div className="mt-1 text-sm font-medium text-fs-text md:text-base">{item.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <HudCorner className="left-4 top-4 h-5 w-5 border-l-2 border-t-2 md:left-6 md:top-6" />
            <HudCorner className="right-4 top-4 h-5 w-5 border-r-2 border-t-2 md:right-6 md:top-6" />
            <HudCorner className="bottom-4 left-4 h-5 w-5 border-b-2 border-l-2 md:bottom-6 md:left-6" />
            <HudCorner className="bottom-4 right-4 h-5 w-5 border-b-2 border-r-2 md:bottom-6 md:right-6" />
          </HeroVizShell>
        </div>
      </section>
      <LandingTicker />
      <LandingPillarsSection />
      <LandingStatsSection />
      <LandingFooter variantLabel="HUD 指挥舱" />
    </div>
  );
}
