"use client";

import { FinovaWordmark } from "@/components/brand/FinovaWordmark";
import { OrbitalCanvas } from "@/components/landing-preview/OrbitalCanvas";
import {
  HeroVizShell,
  LandingFooter,
  LandingPillarsSection,
  LandingStatsSection,
  LandingTicker,
} from "@/components/landing-preview/landing-shared";
import "./landing-preview.css";

const SATELLITES = [
  { tag: "AI", label: "brief.ready" },
  { tag: "MACRO", label: "cpi.sync" },
  { tag: "MKT", label: "spx.live" },
  { tag: "DATA", label: "fred.pull" },
];

export function LandingPreviewOrbital() {
  return (
    <div className="lp-root -mx-6 -mt-3 overflow-hidden md:-mx-10 lg:-mx-14 xl:-mx-20">
      <section className="relative min-h-[88vh] border-b border-fs-border/60 bg-gradient-to-b from-white via-fs-accent-soft/15 to-white">
        <div className="lp-grid-bg absolute inset-0 opacity-40" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-6 pt-8 md:px-10 md:pt-12 lg:px-14">
          <div className="lp-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-fs-accent/25 bg-fs-accent-soft/80 px-3 py-1 text-xs font-medium text-fs-accent-text backdrop-blur-sm">
            <span className="lp-live-dot inline-block h-1.5 w-1.5 rounded-full bg-fs-accent" />
            V3 · 轨道环
          </div>
          <div className="lp-fade-up lp-fade-up-1 mb-6 md:mb-8">
            <FinovaWordmark size="hero" />
          </div>
        </div>

        <div className="relative px-4 pb-16 md:px-8 md:pb-20 lg:px-12 lg:pb-24">
          <HeroVizShell className="bg-white/55">
            <OrbitalCanvas />
            <div className="relative flex min-h-[52vh] flex-col md:min-h-[62vh] lg:min-h-[72vh]">
              <div className="flex flex-1 flex-col items-center justify-center p-8 md:p-12">
                <div className="relative flex h-48 w-48 items-center justify-center rounded-full border border-fs-accent/25 bg-white/60 backdrop-blur-sm md:h-56 md:w-56">
                  <div className="text-center">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fs-accent-text">core</p>
                    <p className="mt-1 text-2xl font-semibold text-fs-text md:text-3xl">LIVE</p>
                    <p className="mt-1 font-mono text-xs text-fs-secondary">4 feeds</p>
                  </div>
                  <span className="lp-live-dot absolute -right-1 top-4 h-2 w-2 rounded-full bg-fs-accent" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-fs-border/50 bg-white/40 p-6 font-mono text-xs backdrop-blur-sm md:grid-cols-4 md:gap-4 md:p-8 md:text-sm">
                {SATELLITES.map((s) => (
                  <div key={s.tag} className="rounded-lg border border-fs-border/60 bg-white/60 px-3 py-2.5">
                    <span className="text-fs-accent">{s.tag}</span>
                    <span className="mx-1.5 text-fs-border">·</span>
                    <span className="text-fs-text">{s.label}</span>
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
      <LandingFooter variantLabel="轨道环" />
    </div>
  );
}
