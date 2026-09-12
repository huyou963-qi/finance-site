import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityRegimeClient } from "@/components/equity/EquityRegimeClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "宏观 Regime" };

export default function QuantRegimePage() {
  return (
    <FeatureGate featureId="quant-regime">
      <EquityRegimeClient />
    </FeatureGate>
  );
}
