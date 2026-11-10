import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { StatisticalAnalysisClient } from "./StatisticalAnalysisClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export default async function StatisticalAnalysisPage() {
  const tr = await getServerTr();
  return (
    <FeatureGate featureId="tools-statistical-analysis">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">{tr("加载中…")}</div>
        }
      >
        <StatisticalAnalysisClient />
      </Suspense>
    </FeatureGate>
  );
}
