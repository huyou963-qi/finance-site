import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { StatisticalAnalysisClient } from "./StatisticalAnalysisClient";

export const dynamic = "force-dynamic";

export default function StatisticalAnalysisPage() {
  return (
    <FeatureGate featureId="tools-statistical-analysis">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">
            加载中…
          </div>
        }
      >
        <StatisticalAnalysisClient />
      </Suspense>
    </FeatureGate>
  );
}
