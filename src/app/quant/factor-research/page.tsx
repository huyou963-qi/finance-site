import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityFactorResearchClient } from "@/components/equity/EquityFactorResearchClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "因子研究" };

export default function QuantFactorResearchPage() {
  return (
    <FeatureGate featureId="quant-factor-research">
      <EquityFactorResearchClient />
    </FeatureGate>
  );
}
