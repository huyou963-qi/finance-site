"use client";

function HudCorner({ className }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute h-4 w-4 border-fs-accent/40 ${className ?? ""}`}
      aria-hidden
    />
  );
}

type LandingHeroChartProps = {
  id: string;
  beam?: boolean;
  shimmer?: boolean;
  className?: string;
};

export function LandingHeroChart({ id, beam = false, shimmer = false, className = "" }: LandingHeroChartProps) {
  const areaId = `${id}-area`;
  const pathD = "M0,95 L40,88 80,72 120,76 160,52 200,58 240,38 280,44 320,28 360,32 400,18 L400,120 L0,120 Z";
  const linePoints = "0,95 40,88 80,72 120,76 160,52 200,58 240,38 280,44 320,28 360,32 400,18";

  return (
    <svg
      viewBox="0 0 400 120"
      className={`h-full min-h-[220px] w-full text-fs-accent md:min-h-[320px] lg:min-h-[420px] ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2383e2" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#2383e2" stopOpacity="0" />
        </linearGradient>
        {shimmer ? (
          <filter id={`${id}-glow`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ) : null}
      </defs>
      <path d={pathD} fill={`url(#${areaId})`} />
      <polyline
        className={shimmer ? "lp-chart-line lp-chart-shimmer" : "lp-chart-line"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        filter={shimmer ? `url(#${id}-glow)` : undefined}
        points={linePoints}
      />
      {beam ? (
        <>
          <path id={`${id}-beam-path`} d="M0,95 L40,88 80,72 120,76 160,52 200,58 240,38 280,44 320,28 360,32 400,18" fill="none" stroke="none" />
          <circle r="4" fill="#5eb3ff" className="lp-beam-glow">
            <animateMotion dur="5s" repeatCount="indefinite" path="M0,95 L40,88 80,72 120,76 160,52 200,58 240,38 280,44 320,28 360,32 400,18" />
          </circle>
        </>
      ) : null}
    </svg>
  );
}

export function LandingHudCorners() {
  return (
    <>
      <HudCorner className="left-4 top-4 h-5 w-5 border-l-2 border-t-2 md:left-6 md:top-6" />
      <HudCorner className="right-4 top-4 h-5 w-5 border-r-2 border-t-2 md:right-6 md:top-6" />
      <HudCorner className="bottom-4 left-4 h-5 w-5 border-b-2 border-l-2 md:bottom-6 md:left-6" />
      <HudCorner className="bottom-4 right-4 h-5 w-5 border-b-2 border-r-2 md:bottom-6 md:right-6" />
    </>
  );
}

export function LandingHeroMetrics() {
  return (
    <div className="grid grid-cols-3 gap-4 font-mono text-sm md:gap-5">
      {[
        { k: "SIG", v: "risk-on" },
        { k: "LAT", v: "12ms" },
        { k: "SRC", v: "FRED+" },
      ].map((item) => (
        <div
          key={item.k}
          className="rounded-lg border border-fs-border/60 bg-white/55 px-3 py-3 backdrop-blur-sm md:px-4 md:py-3.5"
        >
          <div className="text-[11px] text-fs-muted md:text-xs">{item.k}</div>
          <div className="mt-1 text-sm font-medium text-fs-text md:text-base">{item.v}</div>
        </div>
      ))}
    </div>
  );
}

export function LandingHeroHeader() {
  return (
    <div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.18em] text-fs-accent-text/80 md:text-[13px]">
      <span>finova.sys / live</span>
      <span className="flex items-center gap-1.5">
        <span className="lp-live-dot h-1.5 w-1.5 rounded-full bg-fs-accent" />
        streaming
      </span>
    </div>
  );
}
