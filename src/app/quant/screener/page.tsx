import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityScreenerClient } from "@/components/equity/EquityScreenerClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "选股器" };

export default function QuantScreenerPage() {
  return (
    <FeatureGate featureId="quant-screener">
      <EquityScreenerClient />
    </FeatureGate>
  );
}
