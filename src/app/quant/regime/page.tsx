import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityRegimeClient } from "@/components/equity/EquityRegimeClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("宏观 Regime") };
}

export default async function QuantRegimePage() {
  return (
    <FeatureGate featureId="quant-regime">
      <EquityRegimeClient />
    </FeatureGate>
  );
}
