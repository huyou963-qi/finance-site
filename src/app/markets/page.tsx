import { FeatureGate } from "@/components/access/FeatureGate";
import { MarketsClient } from "./MarketsClient";

export const dynamic = "force-dynamic";

export default function MarketsPage() {
  return (
    <FeatureGate featureId="markets">
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <MarketsClient />
      </div>
    </FeatureGate>
  );
}
