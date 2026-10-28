/** Real database acceptance; never publishes. --create-draft explicitly persists one admin-owned draft. */
import { loadEnvConfig } from "@next/env";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

loadEnvConfig(process.cwd());
async function main() {
  const { prisma } = await import("../../src/lib/prisma");
  const { runArticleTool } = await import("../../src/lib/articles/articleMcp");
  const { ARTICLE_SCOPES } = await import("../../src/lib/articles/oauthPolicy");
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true, username: true } });
  if (!admin) throw new Error("数据库没有管理员，无法验收");
  const principal = { userId: admin.id, grantId: "local-market-acceptance", scopes: [...ARTICLE_SCOPES] };
  const call = (name: string, input: Record<string, unknown>) => runArticleTool(name, input, principal);
  const indicators = await call("search_market_indicators", { query: "Brent WTI 馏分油库存", category: "energy" }) as { indicators: Array<{ indicatorId: string; catalogKey: string }> };
  const wti = indicators.indicators.find(i => i.catalogKey === "fred:DCOILWTICO");
  const brent = indicators.indicators.find(i => i.catalogKey === "fred:DCOILBRENTEU");
  if (!wti || !brent) throw new Error("数据库缺少指定现货指标，不使用期货替代");
  const ids = [brent.indicatorId, wti.indicatorId];
  const { queryMarketData } = await import("../../src/lib/market/data");
  const prices = await queryMarketData({ indicatorIds: ids, startDate: "2026-10-01", endDate: "2026-10-28", frequency: "daily" });
  const { calculateMarketSeries } = await import("../../src/lib/market/calculate");
  const spread = await calculateMarketSeries({ operation: "spread", leftIndicatorId: ids[0], rightIndicatorId: ids[1], startDate: "2026-10-01", endDate: "2026-10-28" });
  const inventories = await call("search_market_indicators", { query: "馏分油库存", category: "energy" });
  const inventoryList = (inventories as typeof indicators).indicators;
  const inventory = inventoryList.length ? await queryMarketData({ indicatorIds: [inventoryList[0]!.indicatorId], startDate: "2026-10-01", endDate: "2026-10-28" }) : null;
  const chartSearch = await call("search_charts", { query: "原油 WTI Brent" });
  const chartId = "builtin-us-oil-diesel-monitor:0";
  const chart = await call("get_chart", { chartId });
  const { getChart, renderChartData } = await import("../../src/lib/market/charts");
  const chartData = await renderChartData(await getChart({ chartId }), "2026-10-01", "2026-10-28");
  const observations = prices.series.map(s => {
    const after = s.points.filter(p => p.date >= "2026-10-14" && p.value != null);
    return { indicatorId: s.indicator.indicatorId, name: s.indicator.name, first: after[0] ?? null, last: after.at(-1) ?? null, change: after.length > 1 ? after.at(-1)!.value! - after[0]!.value! : null };
  });
  // Direction comparison uses the same dates across both series.
  const common = prices.series[0]!.points.filter(p => p.date >= "2026-10-14" && p.value != null && prices.series[1]!.points.some(q => q.date === p.date && q.value != null));
  const first = common[0], last = common.at(-1);
  const valueAt = (index: number, date: string) => prices.series[index]!.points.find(p => p.date === date)!.value!;
  const changes = first && last && first.date !== last.date ? [0, 1].map(i => valueAt(i, last.date) - valueAt(i, first.date)) : null;
  const conclusion = changes ? `同日有效样本从 ${first!.date} 至 ${last!.date}：Brent 变化 ${changes[0]!.toFixed(4)} 美元/桶，WTI 变化 ${changes[1]!.toFixed(4)} 美元/桶。该端点比较${changes[0]! * changes[1]! < 0 ? "出现反向变化" : "未出现反向变化"}；这不代表区间内每一天走势相同。` : "10月14日以后同日有效样本不足，无法验证反向走势。";
  const rows = spread.points.map(p => `| ${p.date} | ${prices.series[0]!.points.find(x => x.date === p.date)?.value ?? "缺失"} | ${prices.series[1]!.points.find(x => x.date === p.date)?.value ?? "缺失"} | ${p.value?.toFixed(4) ?? "缺失"} |`).join("\n");
  const latestData = prices.series.flatMap(s => s.points.filter(p => p.value != null).map(p => p.date)).sort().at(-1);
  if (!latestData) throw new Error("指定区间没有价格，不创建空研究草稿");
  let draft: unknown = null, preview: unknown = null, attached: unknown = null;
  if (process.argv.includes("--create-draft")) {
    draft = await call("create_article", { title: "Brent 与 WTI 现货背离核验：2026年10月（MCP验收草稿）", summary: conclusion, category: "energy", tags: ["Brent", "WTI", "MCP验收"], dataCutoff: `${latestData}T00:00:00Z`, sources: prices.series.map(s => s.indicator.sourceUrl).filter(Boolean),
      content: `## 一、Brent与WTI的异常背离\n\n${conclusion}\n\n查询区间：2026-10-01 至 2026-10-28。数据实际截止以表格为准；缺失数据未补值。\n\n## 二、价格与价差\n\n公式：Brent现货 - WTI Cushing现货（USD/bbl），仅同日计算。\n\n| 数据日期 | Brent现货 | WTI现货 | 价差 |\n|---|---:|---:|---:|\n${rows}\n\n## 三、EIA库存\n\n${inventory ? inventory.series.map(s => `${s.indicator.name}（${s.indicator.unit}），来源：${s.indicator.sourceUrl ?? "未知"}。\n\n` + s.points.map(p => `- ${p.date}：${p.value ?? "缺失"}`).join("\n")).join("\n") : "缺少可用库存指标，无法验证库存传导。"}\n\n## 四、数据限制\n\n数据日期与发布日期不同。未获证实的发布日期、修订状态显示未知；不得将样本外日期视为已核实。本草稿用于功能验收，尚未正式发布。` });
    const created = draft as { id: string; updatedAt: string };
    attached = await call("attach_chart_to_article", { articleId: created.id, chartId, displayStartDate: "2026-10-01", displayEndDate: "2026-10-28", renderMode: "snapshot", placement: { type: "after_heading", heading: "一、Brent与WTI的异常背离" }, expectedUpdatedAt: created.updatedAt });
    preview = await call("preview_article", { id: created.id });
  }
  const output = { verifiedAt: new Date().toISOString(), environment: "configured database; service-level calls (not an OAuth client simulation)", indicators, prices, spread, inventory, observations, conclusion, chartSearch, chart, chartData, draft, attached, preview, published: false };
  const directory = resolve(".codex-artifacts"); await mkdir(directory, { recursive: true });
  const path = resolve(directory, "article-market-acceptance.json"); await writeFile(path, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ report: path, pricePointCounts: prices.series.map(s => ({ name: s.indicator.name, count: s.points.filter(p => p.value != null).length, latest: s.coverage.to })), conclusion, chartSeries: chartData.series.length, draft: draft ? { id: (draft as { id: string }).id, previewUrl: (draft as { previewUrl: string }).previewUrl } : null, published: false }, null, 2));
  await prisma.$disconnect();
}
main().catch(error => { console.error(error); process.exit(1); });
