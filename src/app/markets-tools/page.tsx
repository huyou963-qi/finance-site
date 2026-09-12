import { FeatureGate } from "@/components/access/FeatureGate";
import { MarketsToolsClient } from "./MarketsToolsClient";

export const dynamic = "force-dynamic";

export default function MarketsToolsPage() {
  return (
    <FeatureGate featureId="tools-kline-range">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <MarketsToolsClient />
      </div>
    </FeatureGate>
  );
}
