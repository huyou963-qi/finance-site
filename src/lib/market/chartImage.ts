import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireArticleScope, type ArticlePrincipal } from "@/lib/articles/articleOAuth";
import { ArticleConflictError } from "@/lib/articles/articleStore";
import { absoluteUrl, getSiteUrl } from "@/lib/seo/siteUrl";
import { macroPayloadToChartOption } from "@/lib/macroChartOption";
import { chartIdSchema, day, MarketError } from "./schema";
import { getChart, renderChartData, type ChartData } from "./charts";

export const captureChartImageSchema = z.object({
  articleId: z.string().uuid(), chartId: chartIdSchema, startDate: day, endDate: day,
  dataCutoff: z.string().datetime({ offset: true }).optional(),
  width: z.number().int().min(600).max(2000).default(1200), height: z.number().int().min(400).max(1200).default(675),
}).strict();
export const setArticleCoverSchema = z.object({
  articleId: z.string().uuid(), imageUrl: z.string().trim().min(1).max(2000), expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();

/** Use the same ECharts renderer/options as the interactive chart, without launching a browser or fetching URLs. */
export async function renderChartPng(data: ChartData, width: number, height: number) {
  const [echarts, { default: sharp }] = await Promise.all([import("echarts"), import("sharp")]);
  const chart = echarts.init(null, undefined, { renderer: "svg", ssr: true, width, height });
  try {
    const option = macroPayloadToChartOption({ categories: data.categories, series: data.series }, { seriesVisualMap: data.visualMap, displayConfig: data.displayConfig, slotIndex: data.slot });
    option.animation = false;
    option.backgroundColor = "#ffffff";
    option.tooltip = { show: false };
    option.title = { text: data.title, subtext: `${data.categories[0] ?? ""} — ${data.categories.at(-1) ?? ""}`, left: "center", textStyle: { fontSize: 18 } };
    option.grid = { left: 80, right: 100, top: 90, bottom: 120 };
    option.legend = { type: "plain", bottom: 34, textStyle: { fontSize: 11 } };
    if (Array.isArray(option.yAxis)) option.yAxis = option.yAxis.map((axis, i) => ({ ...axis, name: [...new Set(data.series.filter(s => (data.visualMap[s.key]?.axis === "right" ? 1 : 0) === i).map(s => s.unit ?? "单位未知"))].join(" / ") }));
    chart.setOption(option);
    const svg = chart.renderToSVGString();
    const bytes = await sharp(Buffer.from(svg), { limitInputPixels: 3_000_000 }).png().toBuffer();
    if (bytes.byteLength > 8 * 1024 * 1024) throw new MarketError("LIMIT_EXCEEDED", "图片超过8MB限制");
    return bytes;
  } finally { chart.dispose(); }
}
async function owned(articleId: string, principal: ArticlePrincipal) {
  requireArticleScope(principal, "articles:write");
  const row = await prisma.article.findFirst({ where: { id: articleId, authorId: principal.userId } });
  if (!row) throw new MarketError("NOT_FOUND", "文章不存在或不属于当前用户");
  if (row.status === "published") requireArticleScope(principal, "articles:publish");
  return row;
}
export async function captureChartImage(raw: unknown, principal: ArticlePrincipal) {
  const p = captureChartImageSchema.parse(raw);
  await owned(p.articleId, principal);
  const definition = await getChart({ chartId: p.chartId });
  const data = await renderChartData(definition, p.startDate, p.endDate, p.dataCutoff);
  const bytes = await renderChartPng(data, p.width, p.height);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const operationHash = createHash("sha256").update(JSON.stringify({ ...p, revisionFingerprints: data.revisionFingerprints, sha256 })).digest("hex");
  const asset = await prisma.$transaction(async tx => {
    // Serialize captures for this article so a retried/concurrent export cannot create duplicates.
    await tx.$queryRaw`SELECT id FROM public.research_article WHERE id = ${p.articleId}::uuid FOR UPDATE`;
    const article = await tx.article.findFirst({ where: { id: p.articleId, authorId: principal.userId } });
    if (!article) throw new MarketError("NOT_FOUND", "文章不存在");
    if (article.status === "published") requireArticleScope(principal, "articles:publish");
    const existing = await tx.articleAsset.findFirst({ where: { articleId: p.articleId, sourceKind: "chart-image", sourceConfig: { path: ["operationHash"], equals: operationHash } }, select: { id: true } });
    if (existing) return existing;
    return tx.articleAsset.create({ data: { articleId: p.articleId, uploadedById: principal.userId, fileName: `chart-${sha256.slice(0, 16)}.png`, mimeType: "image/png", byteSize: bytes.byteLength, sha256, data: bytes,
      sourceKind: "chart-image", sourceUrl: absoluteUrl(definition.page), capturedAt: new Date(),
      sourceConfig: JSON.parse(JSON.stringify({ operationHash, chartId: p.chartId, query: data.displayStartDate + "/" + data.displayEndDate, dataCutoff: p.dataCutoff ?? null, sources: data.sources, formulas: data.formulas, revisionFingerprints: data.revisionFingerprints, actorId: principal.userId, grantId: principal.grantId })) }, select: { id: true } });
  });
  return { success: true, articleId: p.articleId, assetId: asset.id, imageUrl: absoluteUrl(`/api/article-assets/${asset.id}`), width: p.width, height: p.height, mimeType: "image/png", sha256,
    accessNote: "图片沿用文章权限：草稿需管理员登录，文章发布后公开。此操作不会发布文章或自动设置封面。", sources: data.sources, dataFrom: data.categories[0], dataTo: data.categories.at(-1) };
}
export function normalizeCoverUrl(imageUrl: string) {
  if (imageUrl.startsWith("/api/article-assets/")) return imageUrl;
  let url: URL;
  try { url = new URL(imageUrl); } catch { throw new MarketError("INVALID_INPUT", "图片地址必须为本站附件或完整 http(s) URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new MarketError("INVALID_INPUT", "图片地址无效");
  if (url.origin === new URL(getSiteUrl()).origin && url.pathname.startsWith("/api/article-assets/")) return url.pathname;
  return url.href;
}
export async function setArticleCover(raw: unknown, principal: ArticlePrincipal) {
  const p = setArticleCoverSchema.parse(raw), row = await owned(p.articleId, principal);
  const coverImageUrl = normalizeCoverUrl(p.imageUrl);
  if (coverImageUrl.startsWith("/api/article-assets/")) {
    const assetId = coverImageUrl.slice("/api/article-assets/".length);
    if (!z.string().uuid().safeParse(assetId).success) throw new MarketError("INVALID_INPUT", "附件地址无效");
    const asset = await prisma.articleAsset.findFirst({ where: { id: assetId, articleId: row.id, mimeType: { in: ["image/png", "image/jpeg", "image/webp"] } }, select: { id: true } });
    if (!asset) throw new MarketError("NOT_FOUND", "图片不存在、不是支持的图片或不属于当前文章");
  }
  if (row.coverImageUrl === coverImageUrl) return { success: true, changed: false, articleId: row.id, coverImageUrl, thumbnailUrl: coverImageUrl, updatedAt: row.updatedAt.toISOString() };
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(p.expectedUpdatedAt) + 1));
  const result = await prisma.article.updateMany({ where: { id: row.id, authorId: principal.userId, status: row.status, updatedAt: new Date(p.expectedUpdatedAt) }, data: { coverImageUrl, updatedAt } });
  if (result.count !== 1) throw new ArticleConflictError();
  // listArticles resolves coverUrl from this same field on every read; no second thumbnail record/cache exists.
  return { success: true, changed: true, articleId: row.id, coverImageUrl, thumbnailUrl: coverImageUrl, updatedAt: updatedAt.toISOString() };
}
