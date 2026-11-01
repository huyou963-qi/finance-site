import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureGate } from "@/components/access/FeatureGate";
import { EquitySectorsClient } from "./EquitySectorsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "美股历史 — 历史阶段与行业轮动研究 — GekkoTech",
  description: "研究美股历史阶段、宏观传导与行业轮动，结合当前基本面与可审计证据。",
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
