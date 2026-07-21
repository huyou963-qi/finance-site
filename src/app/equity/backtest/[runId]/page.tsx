import { EquityBacktestReportClient } from "@/components/equity/EquityBacktestReportClient";

export const metadata = { title: "回测报告" };

export default async function EquityBacktestReportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <EquityBacktestReportClient runId={runId} />;
}
