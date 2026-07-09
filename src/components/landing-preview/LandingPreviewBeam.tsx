"use client";

import { FinovaWordmark } from "@/components/brand/FinovaWordmark";
import { SciFiNodeCanvas } from "@/components/landing-preview/SciFiNodeCanvas";
import {
  LandingHeroChart,
  LandingHeroHeader,
  LandingHeroMetrics,
  LandingHudCorners,
} from "@/components/landing-preview/landing-hero-chart";
import {
  HeroVizShell,
  LandingFooter,
  LandingPillarsSection,
  LandingStatsSection,
  LandingTicker,
} from "@/components/landing-preview/landing-shared";
import "./landing-preview.css";

export function LandingPreviewBeam() {
  return (
    <div className="lp-root -mx-6 -mt-3 overflow-hidden md:-mx-10 lg:-mx-14 xl:-mx-20">
      <section className="relative min-h-[88vh] border-b border-fs-border/60">
        <div className="lp-grid-bg absolute inset-0" aria-hidden />
        <div className="lp-beam-bg-glow pointer-events-none absolute inset-0" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-6 pt-8 md:px-10 md:pt-12 lg:px-14">
          <div className="lp-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-fs-accent/25 bg-fs-accent-soft/80 px-3 py-1 text-xs font-medium text-fs-accent-text backdrop-blur-sm">
            <span className="lp-live-dot inline-block h-1.5 w-1.5 rounded-full bg-fs-accent" />
            V7 · 光束 · HUD 电影感
          </div>
          <div className="lp-fade-up lp-fade-up-1 mb-6 md:mb-8">
            <FinovaWordmark size="hero" />
          </div>
        </div>

        <div className="relative px-4 pb-16 md:px-8 md:pb-20 lg:px-12 lg:pb-24">
          <HeroVizShell className="bg-white/50 shadow-[0_28px_90px_rgba(35,131,226,0.12)]">
            <SciFiNodeCanvas glow />
            <div className="lp-scan-line pointer-events-none absolute inset-x-0 top-[20%] h-px bg-gradient-to-r from-transparent via-fs-accent/50 to-transparent" />
            <div className="lp-scan-line lp-scan-fast pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#5eb3ff]/70 to-transparent" />

            <div className="relative flex min-h-[52vh] flex-col justify-between p-8 md:min-h-[62vh] md:p-10 lg:min-h-[72vh] lg:p-12">
              <LandingHeroHeader />
              <div className="relative my-6 min-h-[220px] flex-1 md:min-h-[320px] lg:min-h-[420px]">
                <div className="lp-beam-sweep pointer-events-none absolute inset-0 overflow-hidden rounded-lg" aria-hidden>
                  <div className="lp-beam-sweep-bar absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-fs-accent/15 to-transparent" />
                </div>
                <LandingHeroChart id="beam" beam shimmer />
              </div>
              <LandingHeroMetrics />
            </div>
            <LandingHudCorners />
          </HeroVizShell>
        </div>
      </section>
      <LandingTicker />
      <LandingPillarsSection />
      <LandingStatsSection />
      <LandingFooter variantLabel="光束 · HUD 电影感" />
    </div>
  );
}
