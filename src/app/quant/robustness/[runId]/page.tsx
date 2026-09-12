import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityRobustnessReportClient } from "@/components/equity/EquityRobustnessReportClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "稳健性报告" };

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
