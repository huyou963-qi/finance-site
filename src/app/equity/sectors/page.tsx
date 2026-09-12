import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { EquitySectorsClient } from "./EquitySectorsClient";

export const dynamic = "force-dynamic";

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
