import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityScreenerClient } from "@/components/equity/EquityScreenerClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("选股器") };
}

export default async function QuantScreenerPage() {
  return (
    <FeatureGate featureId="quant-screener">
      <EquityScreenerClient />
    </FeatureGate>
  );
}
