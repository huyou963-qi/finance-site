import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityRobustnessClient } from "@/components/equity/EquityRobustnessClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("稳健性分析") };
}

export default async function QuantRobustnessPage() {
  return (
    <FeatureGate featureId="quant-robustness">
      <EquityRobustnessClient />
    </FeatureGate>
  );
}
