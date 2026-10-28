import { type ArticlePrincipal, requireArticleScope } from "@/lib/articles/articleOAuth";
import { attachChartToArticle } from "./attach";
import { calculateMarketSeries } from "./calculate";
import { getChart, searchCharts } from "./charts";
import { queryMarketData } from "./data";
import { searchMarketIndicators } from "./indicators";
import { captureChartImageSchema, setArticleCoverSchema, captureChartImage, setArticleCover } from "./chartImage";
import { attachChartSchema, calculateMarketSchema, getChartSchema, queryMarketSchema, searchChartsSchema, searchIndicatorsSchema, MarketError } from "./schema";

export const marketToolDefinitions = [
  ["capture_chart_image", "将系统图表按真实数据导出 PNG，保存为指定本人文章的附件并返回图片地址。草稿图片受登录保护，发布后公开；不自动设置封面或发布。", captureChartImageSchema, "articles:write", false],
  ["set_article_cover", "按文章ID和图片地址设置封面及列表缩略图，需要最新expectedUpdatedAt。已发布文章还需articles:publish权限，不改变正文或发布状态。", setArticleCoverSchema, "articles:write", false],
  ["search_market_indicators", "检索网站已登记宏观指标，中英文别名可用。返回来源、单位、现货/期货口径与真实覆盖范围，不替换数据。", searchIndicatorsSchema, "articles:read", true],
  ["query_market_data", "查询数据库原生历史数据和版本信息。频率仅校验，不自动聚合或补值。按 nextCursor 翻页；历史截止仅使用已证明可见的版本。", queryMarketSchema, "articles:read", true],
  ["calculate_market_series", "白名单计算价差、比值、变化、滚动均值、同比环比、分位数和相关系数。同日对齐；现货/期货混用须先征得用户明确同意。", calculateMarketSchema, "articles:read", true],
  ["search_charts", "搜索网站系统图表（不读取私人模板）。返回稳定 chartId、指标、权限、可嵌入状态及预览地址。", searchChartsSchema, "articles:read", true],
  ["get_chart", "获取系统图表配置、原始指标来源、单位、覆盖范围和变换。高级图型不可嵌入时明确返回，不降级为错误图型。", getChartSchema, "articles:read", true],
  ["attach_chart_to_article", "将系统交互图表引用插入本人草稿指定标题之后或文末。默认实时；snapshot 冻结数据与配置。幂等，需最近 updatedAt；已发表文章须先撤回。不会发布文章。", attachChartSchema, "articles:write", false],
] as const;
const usage = new Map<string, { start: number; count: number; active: number }>();
export async function runMarketTool(name: string, raw: unknown, principal: ArticlePrincipal) {
  requireArticleScope(principal, ["attach_chart_to_article", "capture_chart_image", "set_article_cover"].includes(name) ? "articles:write" : "articles:read");
  const now = Date.now();
  for (const [id, u] of usage) if (u.active === 0 && u.start < now - 60000) usage.delete(id);
  const u = usage.get(principal.userId) ?? { start: now, count: 0, active: 0 };
  if (u.count >= 60 || u.active >= 3 || usage.size >= 5000 && !usage.has(principal.userId)) throw new MarketError("RATE_LIMITED", "查询过于频繁，请稍后重试");
  u.count++; u.active++; usage.set(principal.userId, u);
  try {
    switch (name) {
      case "capture_chart_image": return await captureChartImage(raw, principal);
      case "set_article_cover": return await setArticleCover(raw, principal);
      case "search_market_indicators": return await searchMarketIndicators(raw);
      case "query_market_data": return await queryMarketData(raw);
      case "calculate_market_series": return await calculateMarketSeries(raw);
      case "search_charts": return await searchCharts(raw);
      case "get_chart": return await getChart(raw);
      case "attach_chart_to_article": return await attachChartToArticle(raw, principal);
      default: throw new MarketError("UNKNOWN_TOOL", "未知工具");
    }
  } finally {
    u.active--;
  }
}
