import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ArticleConflictError, getArticleById } from "@/lib/articles/articleStore";
import { type ArticlePrincipal, requireArticleScope } from "@/lib/articles/articleOAuth";
import { parseArticleWriteInput } from "@/lib/articles/articleSchema";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { getChart, renderChartData, type ChartData, type ChartDefinition } from "./charts";
import { attachChartSchema, MarketError } from "./schema";
import { chartReferenceMarkdown, insertChartReference } from "./chartReference";

export type StoredChartReference = {
  version: 1; chartId: string; renderMode: "live" | "snapshot"; createdAt: string;
  dataCutoff: string | null; displayStartDate: string; displayEndDate: string;
  displayOptions: ReturnType<typeof attachChartSchema.parse>["displayOptions"];
  definition: ChartDefinition; snapshot?: ChartData;
};
export async function attachChartToArticle(raw: unknown, principal: ArticlePrincipal) {
  requireArticleScope(principal, "articles:write");
  const p = attachChartSchema.parse(raw);
  const row = await prisma.article.findFirst({ where: { id: p.articleId, authorId: principal.userId } });
  if (!row) throw new MarketError("NOT_FOUND", "文章不存在或不属于当前用户");
  if (row.status !== "draft") throw new MarketError("INVALID_STATE", "请先撤回已发布文章再添加图表");
  const { expectedUpdatedAt: _, ...operation } = p;
  void _;
  const operationHash = createHash("sha256").update(JSON.stringify(operation)).digest("hex");
  const assets = await prisma.articleAsset.findMany({ where: { articleId: row.id, sourceKind: "chart-reference" }, select: { id: true, sha256: true, sourceConfig: true }, take: 101 });
  const existing = assets.find(a => (a.sourceConfig as { operationHash?: string } | null)?.operationHash === operationHash && row.bodyMarkdown.includes(JSON.stringify({ referenceId: a.id })));
  if (existing) return { attached: true, changed: false, articleId: row.id, referenceId: existing.id, updatedAt: row.updatedAt.toISOString(), previewUrl: absoluteUrl(`/articles/preview/${row.id}`) };
  if (row.updatedAt.getTime() !== Date.parse(p.expectedUpdatedAt)) throw new ArticleConflictError();
  if (assets.length >= 30) throw new MarketError("LIMIT_EXCEEDED", "每篇文章最多30个图表引用");
  const definition = await getChart({ chartId: p.chartId });
  const data = await renderChartData(definition, p.displayStartDate, p.displayEndDate, p.dataCutoff);
  const stored: StoredChartReference = { version: 1, chartId: p.chartId, renderMode: p.renderMode, createdAt: new Date().toISOString(),
    dataCutoff: p.dataCutoff ?? (p.renderMode === "snapshot" ? data.retrievedAt : null), displayStartDate: p.displayStartDate, displayEndDate: p.displayEndDate, displayOptions: p.displayOptions, definition,
    ...(p.renderMode === "snapshot" ? { snapshot: data } : {}) };
  const referenceId = randomUUID();
  let body: string;
  try { body = insertChartReference(row.bodyMarkdown, chartReferenceMarkdown(referenceId), p.placement); } catch (e) { throw new MarketError("INVALID_PLACEMENT", (e as Error).message); }
  parseArticleWriteInput({ ...row, bodyMarkdown: body });
  const bytes = Buffer.from(JSON.stringify(stored)), capturedAt = new Date(stored.createdAt);
  if (bytes.byteLength > 2_000_000) throw new MarketError("LIMIT_EXCEEDED", "图表引用超过2MB，请缩短范围");
  const updatedAt = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
  await prisma.$transaction(async tx => {
    const changed = await tx.article.updateMany({ where: { id: row.id, authorId: principal.userId, status: "draft", updatedAt: new Date(p.expectedUpdatedAt) }, data: { bodyMarkdown: body, updatedAt } });
    if (changed.count !== 1) throw new ArticleConflictError();
    await tx.articleAsset.create({ data: { id: referenceId, articleId: row.id, uploadedById: principal.userId, fileName: `chart-${referenceId}.json`, mimeType: "application/json", byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"), data: bytes, sourceKind: "chart-reference", sourceUrl: absoluteUrl(definition.page), capturedAt,
      sourceConfig: { operationHash, chartId: p.chartId, renderMode: p.renderMode, actorId: principal.userId, grantId: principal.grantId, beforeUpdatedAt: p.expectedUpdatedAt, afterUpdatedAt: updatedAt.toISOString(), createdAt: stored.createdAt } as Prisma.InputJsonValue } });
  });
  return { attached: true, changed: true, articleId: row.id, referenceId, chartId: p.chartId, renderMode: p.renderMode, updatedAt: updatedAt.toISOString(), previewUrl: absoluteUrl(`/articles/preview/${row.id}`), article: await getArticleById(row.id) };
}
