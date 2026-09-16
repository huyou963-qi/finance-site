import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureGate } from "@/components/access/FeatureGate";
import { EquitySectorsClient } from "./EquitySectorsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "美股 GICS 行业总览 — 收益、财报与成分股 — GekkoTech",
  description: "GICS 11 大行业的收益表现、财报叙事与成分股，按行业下钻查看细分板块。",
};

export default function EquitySectorsPage() {
  return (
    <FeatureGate featureId="equity-sectors">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">
            加载中…
          </div>
        }
      >
        <EquitySectorsClient />
      </Suspense>
    </FeatureGate>
  );
}
