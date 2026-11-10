import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityBacktestClient } from "@/components/equity/EquityBacktestClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("策略回测") };
}

export default async function QuantBacktestPage() {
  return (
    <FeatureGate featureId="quant-backtest">
      <EquityBacktestClient />
    </FeatureGate>
  );
}
