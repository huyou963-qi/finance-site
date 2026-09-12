import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityBacktestReportClient } from "@/components/equity/EquityBacktestReportClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "回测报告" };

export default async function QuantBacktestReportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return (
    <FeatureGate featureId="quant-backtest">
      <EquityBacktestReportClient runId={runId} />
    </FeatureGate>
  );
}
