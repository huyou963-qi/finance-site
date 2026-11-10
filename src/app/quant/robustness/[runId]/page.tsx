import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityRobustnessReportClient } from "@/components/equity/EquityRobustnessReportClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("稳健性报告") };
}

export default async function QuantRobustnessReportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return (
    <FeatureGate featureId="quant-robustness">
      <EquityRobustnessReportClient runId={runId} />
    </FeatureGate>
  );
}
