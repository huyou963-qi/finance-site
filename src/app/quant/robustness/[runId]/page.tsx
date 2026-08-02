import { EquityRobustnessReportClient } from "@/components/equity/EquityRobustnessReportClient";

export const metadata = { title: "稳健性报告" };

export default async function QuantRobustnessReportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <EquityRobustnessReportClient runId={runId} />;
}
