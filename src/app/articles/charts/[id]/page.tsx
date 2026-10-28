import { ArticleChart } from "@/components/articles/ArticleChart";
import { parseChartRouteId } from "@/lib/market/schema";
import { notFound } from "next/navigation";
export const metadata = { title: "系统图表预览", robots: { index: false, follow: false } };
export default async function ChartPreview({ params }: { params: Promise<{ id: string }> }) {
  const chartId = parseChartRouteId((await params).id);
  if (!chartId) notFound();
  return <main className="mx-auto w-full max-w-4xl px-4 py-6"><a className="text-sm underline" href="/macro">返回宏观数据</a><ArticleChart chartId={chartId} /></main>;
}
