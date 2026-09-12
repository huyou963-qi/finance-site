import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { OwnershipClient } from "./OwnershipClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "持股与供给监控 | GekkoTech" };
export default function OwnershipPage() {
  return (
    <FeatureGate featureId="equity-ownership">
      <Suspense fallback={<p className="p-6">加载持股监控…</p>}>
        <OwnershipClient />
      </Suspense>
    </FeatureGate>
  );
}
