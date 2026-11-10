import { FeatureGate } from "@/components/access/FeatureGate";
import { EquityBacktestReportClient } from "@/components/equity/EquityBacktestReportClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("回测报告") };
}

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
