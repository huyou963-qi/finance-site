import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { FuturesPositionsClient } from "./FuturesPositionsClient";

export const dynamic = "force-dynamic";

export default function FuturesPositionsPage() {
  return (
    <FeatureGate featureId="tools-futures-positions">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">
            加载中…
          </div>
        }
      >
        <FuturesPositionsClient />
      </Suspense>
    </FeatureGate>
  );
}
