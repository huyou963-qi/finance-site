import { Suspense } from "react";
import { StatisticalAnalysisClient } from "./StatisticalAnalysisClient";

export default function StatisticalAnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          加载中…
        </div>
      }
    >
      <StatisticalAnalysisClient />
    </Suspense>
  );
}
