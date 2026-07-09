"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LandingPreviewAurora } from "@/components/landing-preview/LandingPreviewAurora";
import { LandingPreviewBeam } from "@/components/landing-preview/LandingPreviewBeam";
import { LandingPreviewFusion } from "@/components/landing-preview/LandingPreviewFusion";
import { LandingPreviewHud } from "@/components/landing-preview/LandingPreviewHud";
import { LandingPreviewNebula } from "@/components/landing-preview/LandingPreviewNebula";
import { LandingPreviewOrbital } from "@/components/landing-preview/LandingPreviewOrbital";
import { LandingPreviewTerminal } from "@/components/landing-preview/LandingPreviewTerminal";

export const LANDING_VARIANTS = [
  { id: "hud", label: "V1 HUD", desc: "节点网络", group: "基础" },
  { id: "aurora", label: "V2 极光", desc: "渐变光晕", group: "基础" },
  { id: "fusion", label: "V5 融合", desc: "HUD+极光+光束", group: "推荐" },
  { id: "nebula", label: "V6 星云", desc: "流动极光+星尘", group: "推荐" },
  { id: "beam", label: "V7 光束", desc: "电影感扫描", group: "推荐" },
  { id: "orbital", label: "V3 轨道", desc: "椭圆轨道", group: "其他" },
  { id: "terminal", label: "V4 终端", desc: "命令行", group: "其他" },
] as const;

export type LandingVariantId = (typeof LANDING_VARIANTS)[number]["id"];

function isValidVariant(v: string | null): v is LandingVariantId {
  return LANDING_VARIANTS.some((item) => item.id === v);
}

const RENDER: Record<LandingVariantId, () => ReactNode> = {
  hud: () => <LandingPreviewHud />,
  aurora: () => <LandingPreviewAurora />,
  fusion: () => <LandingPreviewFusion />,
  nebula: () => <LandingPreviewNebula />,
  beam: () => <LandingPreviewBeam />,
  orbital: () => <LandingPreviewOrbital />,
  terminal: () => <LandingPreviewTerminal />,
};

export function LandingPreviewGallery() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("v");
  const active: LandingVariantId = isValidVariant(raw) ? raw : "fusion";

  const setVariant = (id: LandingVariantId) => {
    router.replace(`/landing-preview?v=${id}`, { scroll: false });
  };

  const recommended = LANDING_VARIANTS.filter((v) => v.group === "推荐");
  const basic = LANDING_VARIANTS.filter((v) => v.group === "基础");
  const other = LANDING_VARIANTS.filter((v) => v.group === "其他");

  return (
    <div className="flex min-h-full flex-1 flex-col w-full pb-6 md:pb-10">
      <div className="sticky top-0 z-50 border-b border-fs-border/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-2.5 md:px-6">
          <p className="mb-2 text-xs font-medium text-fs-muted">设计稿对比 · 推荐先看 V5–V7</p>
          <div className="flex flex-wrap items-center gap-2">
            {[...recommended, ...basic, ...other].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariant(v.id)}
                className={`rounded-lg px-3 py-1.5 text-left text-xs transition md:text-sm ${
                  active === v.id
                    ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30"
                    : v.group === "推荐"
                      ? "bg-fs-accent-soft/40 text-fs-accent-text hover:bg-fs-accent-soft"
                      : "text-fs-secondary hover:bg-fs-elevated hover:text-fs-text"
                }`}
              >
                <span className="font-medium">{v.label}</span>
                <span className="ml-1.5 hidden text-fs-muted sm:inline">· {v.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {RENDER[active]()}
    </div>
  );
}
