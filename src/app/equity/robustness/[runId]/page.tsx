import { redirect } from "next/navigation";

export default async function EquityRobustnessReportRedirect({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  redirect(`/quant/robustness/${runId}`);
}
