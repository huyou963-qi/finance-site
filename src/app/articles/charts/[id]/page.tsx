import { ArticleChart } from "@/components/articles/ArticleChart";
import { parseChartRouteId } from "@/lib/market/schema";
import { notFound } from "next/navigation";
import { getServerTr } from "@/i18n/serverText";
export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("系统图表预览"), robots: { index: false, follow: false } };
}
export default async function ChartPreview({ params }: { params: Promise<{ id: string }> }) {
  const tr = await getServerTr();
  const chartId = parseChartRouteId((await params).id);
  if (!chartId) notFound();
  return <main className="mx-auto w-full max-w-4xl px-4 py-6"><a className="text-sm underline" href="/macro">{tr("返回宏观数据")}</a><ArticleChart chartId={chartId} /></main>;
}
