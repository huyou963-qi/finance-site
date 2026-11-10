import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityFactorResearchClient } from "@/components/equity/EquityFactorResearchClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("因子研究") };
}

export default async function QuantFactorResearchPage() {
  return (
    <FeatureGate featureId="quant-factor-research">
      <EquityFactorResearchClient />
    </FeatureGate>
  );
}
