"use client";

import { FinovaWordmark } from "@/components/brand/FinovaWordmark";
import { AuroraFlowCanvas } from "@/components/landing-preview/AuroraFlowCanvas";
import { SciFiNodeCanvas } from "@/components/landing-preview/SciFiNodeCanvas";
import { LandingFusionChart } from "@/components/landing-preview/LandingFusionChart";
import {
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

export function LandingPreviewFusion() {
  return (
    <div className="lp-root -mx-6 -mt-3 overflow-hidden md:-mx-10 lg:-mx-14 xl:-mx-20">
      <section className="relative min-h-[88vh] border-b border-fs-border/60">
        <div className="lp-aurora-bg absolute inset-0" aria-hidden />
        <div className="lp-grid-bg absolute inset-0 opacity-60" aria-hidden />
        <div className="lp-aurora-blob lp-aurora-blob-a pointer-events-none absolute -left-20 top-10 h-96 w-96 rounded-full opacity-70 blur-3xl" aria-hidden />
        <div className="lp-aurora-blob lp-aurora-blob-b pointer-events-none absolute -right-24 bottom-0 h-[28rem] w-[28rem] rounded-full opacity-60 blur-3xl" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-6 pt-8 md:px-10 md:pt-12 lg:px-14">
          <div className="lp-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-fs-accent/30 bg-white/75 px-3 py-1 text-xs font-medium text-fs-accent-text backdrop-blur-sm">
            <span className="lp-live-dot inline-block h-1.5 w-1.5 rounded-full bg-fs-accent" />
            V5 · 融合 · HUD + 极光
          </div>
          <div className="lp-fade-up lp-fade-up-1 mb-6 md:mb-8">
            <FinovaWordmark size="hero" />
          </div>
        </div>

        <div className="relative px-4 pb-16 md:px-8 md:pb-20 lg:px-12 lg:pb-24">
          <HeroVizShell className="bg-white/35 shadow-[0_32px_100px_rgba(35,131,226,0.14)]">
            <AuroraFlowCanvas className="opacity-80" />
            <SciFiNodeCanvas glow />
            <div className="lp-scan-line pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fs-accent/80 to-transparent" />
            <div className="lp-scan-line lp-scan-reverse pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#5eb3ff]/60 to-transparent" />

            <div className="lp-pulse-rings pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="lp-pulse-ring absolute rounded-full border border-fs-accent/15"
                  style={{ width: `${i * 28}%`, height: `${i * 16}%`, animationDelay: `${i * 0.5}s` }}
                />
              ))}
            </div>

            <div className="relative flex min-h-[52vh] flex-col justify-between p-8 md:min-h-[62vh] md:p-10 lg:min-h-[72vh] lg:p-12">
              <LandingHeroHeader />
              <div className="my-6 min-h-[220px] flex-1 md:min-h-[320px] lg:min-h-[420px]">
                <LandingFusionChart />
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
      <LandingFooter variantLabel="融合 · HUD + 极光" />
    </div>
  );
}
