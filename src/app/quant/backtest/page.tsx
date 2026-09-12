import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityBacktestClient } from "@/components/equity/EquityBacktestClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "策略回测" };

export default function QuantBacktestPage() {
  return (
    <FeatureGate featureId="quant-backtest">
      <EquityBacktestClient />
    </FeatureGate>
  );
}
