import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityRobustnessClient } from "@/components/equity/EquityRobustnessClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "稳健性分析" };

export default function QuantRobustnessPage() {
  return (
    <FeatureGate featureId="quant-robustness">
      <EquityRobustnessClient />
    </FeatureGate>
  );
}
