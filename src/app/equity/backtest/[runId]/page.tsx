import { redirect } from "next/navigation";

export default async function EquityBacktestReportRedirect({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  redirect(`/quant/backtest/${runId}`);
}
