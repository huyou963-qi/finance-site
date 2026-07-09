"use client";

import { useEffect, useState } from "react";
import { FinovaWordmark } from "@/components/brand/FinovaWordmark";
import {
  HeroVizShell,
  LandingFooter,
  LandingPillarsSection,
  LandingStatsSection,
  LandingTicker,
} from "@/components/landing-preview/landing-shared";
import "./landing-preview.css";

const LOG_LINES = [
  "> ingest fred:DGS10 ... ok (142ms)",
  "> sync macro:us_cpi_yoy ... ok",
  "> ai/brief weekly digest ... queued",
  "> market:SPX snapshot ... 5487.03",
  "> scheduler: 12 connectors active",
  "> validate observations ... 2400+ series",
];

function TerminalLog() {
  const [visible, setVisible] = useState(1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(LOG_LINES.length);
      return;
    }
    const id = setInterval(() => {
      setVisible((v) => (v >= LOG_LINES.length ? 1 : v + 1));
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="font-mono text-xs leading-relaxed text-fs-secondary md:text-sm">
      {LOG_LINES.slice(0, visible).map((line, i) => (
        <p key={line} className={i === visible - 1 ? "lp-terminal-cursor text-fs-accent-text" : ""}>
          {line}
        </p>
      ))}
    </div>
  );
}

export function LandingPreviewTerminal() {
  return (
    <div className="lp-root -mx-6 -mt-3 overflow-hidden md:-mx-10 lg:-mx-14 xl:-mx-20">
      <section className="relative min-h-[88vh] border-b border-fs-border/60 bg-fs-elevated/40">
        <div className="lp-terminal-rain pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden />

        <div className="relative mx-auto max-w-6xl px-6 pt-8 md:px-10 md:pt-12 lg:px-14">
          <div className="lp-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-fs-accent/25 bg-white/80 px-3 py-1 text-xs font-medium text-fs-accent-text backdrop-blur-sm">
            <span className="lp-live-dot inline-block h-1.5 w-1.5 rounded-full bg-fs-accent" />
            V4 · 终端屏
          </div>
          <div className="lp-fade-up lp-fade-up-1 mb-6 md:mb-8">
            <FinovaWordmark size="hero" />
          </div>
        </div>

        <div className="relative px-4 pb-16 md:px-8 md:pb-20 lg:px-12 lg:pb-24">
          <HeroVizShell className="border-fs-accent/20 bg-[#fafaf8]/90">
            <div className="relative flex min-h-[52vh] flex-col md:min-h-[62vh] lg:min-h-[72vh]">
              <div className="flex items-center justify-between border-b border-fs-border/70 bg-white/70 px-6 py-3 font-mono text-[11px] text-fs-muted md:px-8 md:text-xs">
                <span>finova@research — bash — 80×24</span>
                <span className="flex items-center gap-1.5 text-fs-accent-text">
                  <span className="lp-live-dot h-1.5 w-1.5 rounded-full bg-fs-accent" />
                  connected
                </span>
              </div>

              <div className="grid flex-1 gap-0 md:grid-cols-[1fr_1.2fr]">
                <div className="border-b border-fs-border/60 p-6 md:border-b-0 md:border-r md:p-8">
                  <p className="font-mono text-xs text-fs-accent-text">$ finova status</p>
                  <div className="mt-4">
                    <TerminalLog />
                  </div>
                </div>

                <div className="flex flex-col justify-center p-6 md:p-8">
                  <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-fs-muted">chart.render()</p>
                  <svg viewBox="0 0 400 140" className="w-full text-fs-accent" aria-hidden>
                    <defs>
                      <pattern id="lp-term-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(35,131,226,0.08)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="400" height="140" fill="url(#lp-term-grid)" />
                    <polyline
                      className="lp-chart-line"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      points="0,110 50,95 100,88 150,72 200,78 250,52 300,58 350,38 400,28"
                    />
                  </svg>
                  <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[11px] md:text-xs">
                    {[
                      { k: "mode", v: "data-driven" },
                      { k: "ai", v: "on" },
                      { k: "src", v: "12" },
                    ].map((item) => (
                      <div key={item.k} className="rounded border border-fs-border bg-white/80 px-2 py-1.5">
                        <span className="text-fs-muted">{item.k}=</span>
                        <span className="text-fs-text">{item.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </HeroVizShell>
        </div>
      </section>
      <LandingTicker />
      <LandingPillarsSection />
      <LandingStatsSection />
      <LandingFooter variantLabel="终端屏" />
    </div>
  );
}
