import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema, ToolSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { createArticleSlug, parseArticleWriteInput } from "./articleSchema";
import { ArticleConflictError, createArticle, getArticleById, updateArticle } from "./articleStore";
import { challengeHeader, OAuthError, requireArticleScope, type ArticlePrincipal } from "./articleOAuth";
import type { ArticleScope } from "./oauthPolicy";
import { marketToolDefinitions, runMarketTool } from "@/lib/market/tools";
import { MarketError } from "@/lib/market/schema";

export class ArticleToolError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const id = z.string().uuid();
const expectedUpdatedAt = z.string().datetime({ offset: true }).describe("必须传入最近读取的 updatedAt；冲突后重新读取，禁止盲目重试覆盖");
const writeFields = {
  title: z.string().trim().min(1).max(200), summary: z.string().max(1200), content: z.string().max(200_000),
  category: z.string().trim().min(1).max(64), tags: z.array(z.string().trim().min(1).max(32)).max(12),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional(),
  seoTitle: z.string().max(200).nullable().optional(), seoDescription: z.string().max(1200).nullable().optional(),
  sources: z.array(z.string().url().max(2000).refine(s => ["https:", "http:"].includes(new URL(s).protocol))).max(80).optional(),
  dataCutoff: z.string().datetime({ offset: true }).nullable().optional().describe("事实和数据的截止时刻；发布前必填，不自动假定为当前时刻"),
};
export const createArticleToolSchema = z.object({ ...writeFields, status: z.literal("draft").default("draft") }).strict();
export const updateArticleToolSchema = z.object(writeFields).partial().extend({ id, expectedUpdatedAt }).strict();
export const listArticleToolSchema = z.object({
  page: z.number().int().min(1).max(10000).default(1), pageSize: z.number().int().min(1).max(100).default(20),
  category: z.string().max(64).optional(), keyword: z.string().max(200).optional(), status: z.enum(["draft", "published"]).optional(),
  createdAfter: z.string().datetime({ offset: true }).optional(), createdBefore: z.string().datetime({ offset: true }).optional(),
  updatedAfter: z.string().datetime({ offset: true }).optional(), updatedBefore: z.string().datetime({ offset: true }).optional(),
}).strict();
function toolArticle(article: NonNullable<Awaited<ReturnType<typeof getArticleById>>>) {
  return { ...article, content: article.bodyMarkdown, canonicalUrl: absoluteUrl(`/articles/${article.slug}`),
    previewUrl: absoluteUrl(`/articles/preview/${article.id}`) };
}
async function ownedArticle(principal: ArticlePrincipal, lookup: { id?: string; slug?: string }) {
  const row = await prisma.article.findFirst({ where: { ...lookup, authorId: principal.userId }, select: { id: true } });
  const article = row ? await getArticleById(row.id) : null;
  if (!article) throw new ArticleToolError("NOT_FOUND", "文章不存在或不属于当前授权用户");
  return article;
}
function translateWrite(input: Record<string, unknown>) {
  const result = { ...input };
  delete result.id; delete result.expectedUpdatedAt;
  if ("content" in result) { result.bodyMarkdown = result.content; delete result.content; }
  if (Array.isArray(result.sources)) {
    result.sourceManifest = result.sources.map(url => ({ label: new URL(String(url)).hostname.slice(0, 200), url, kind: "external" }));
    delete result.sources;
  }
  return result;
}
function validateWrite(raw: Record<string, unknown>) {
  try { return parseArticleWriteInput(raw); }
  catch (error) { throw new ArticleToolError("CONTENT_INVALID", error instanceof Error ? error.message : "文章内容无效"); }
}
export async function runArticleTool(name: string, input: Record<string, unknown>, principal: ArticlePrincipal) {
  if (marketToolDefinitions.some(d => d[0] === name)) return runMarketTool(name, input, principal);
  const required: Record<string, ArticleScope> = { list_articles: "articles:read", get_article: "articles:read", preview_article: "articles:read", create_article: "articles:write", update_article: "articles:write", publish_article: "articles:publish", unpublish_article: "articles:unpublish" };
  if (!required[name]) throw new ArticleToolError("UNKNOWN_TOOL", "未知工具");
  requireArticleScope(principal, required[name]);
  if (name === "list_articles") {
    const p = listArticleToolSchema.parse(input);
    const where = { authorId: principal.userId, category: p.category, status: p.status,
      createdAt: { gte: p.createdAfter, lte: p.createdBefore }, updatedAt: { gte: p.updatedAfter, lte: p.updatedBefore },
      ...(p.keyword ? { OR: ["title", "summary", "bodyMarkdown"].map(field => ({ [field]: { contains: p.keyword, mode: "insensitive" as const } })) } : {}) };
    const [total, articles] = await prisma.$transaction([
      prisma.article.count({ where }), prisma.article.findMany({ where, skip: (p.page - 1) * p.pageSize, take: p.pageSize,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }], select: { id: true, slug: true, title: true, summary: true, category: true, tags: true, status: true, createdAt: true, updatedAt: true, publishedAt: true } }),
    ]);
    return { total, page: p.page, pageSize: p.pageSize, articles };
  }
  if (name === "create_article") {
    const p = createArticleToolSchema.parse(input);
    const data = validateWrite({ ...translateWrite(p), slug: p.slug ?? createArticleSlug(), status: "draft" });
    return { created: true, ...toolArticle(await createArticle(data, principal.userId)) };
  }
  const article = await ownedArticle(principal, input.id ? { id: String(input.id) } : { slug: String(input.slug) });
  if (name === "get_article" || name === "preview_article") {
    return { ...toolArticle(article), ...(name === "preview_article" ? { previewRequiresAdminLogin: true, renderer: "ArticleMarkdown (same as public article and editor)" } : {}) };
  }
  if (name === "update_article") {
    const p = updateArticleToolSchema.parse(input);
    if (article.status !== "draft") throw new ArticleToolError("INVALID_STATE", "请先使用 unpublish_article 撤回已发布文章再编辑");
    const data = validateWrite({ ...article, ...translateWrite(p), status: "draft" });
    const updated = await updateArticle(article.id, data, p.expectedUpdatedAt);
    if (!updated) throw new ArticleToolError("NOT_FOUND", "文章不存在");
    return { updated: true, ...toolArticle(updated) };
  }
  const target = name === "publish_article" ? "published" : "draft";
  if (article.status === target) return { success: true, changed: false, ...toolArticle(article) };
  const data = validateWrite({ ...article, status: target });
  const updated = await updateArticle(article.id, data, String(input.expectedUpdatedAt));
  if (!updated) throw new ArticleToolError("NOT_FOUND", "文章不存在");
  return { success: true, changed: true, ...toolArticle(updated) };
}

export function createArticleMcpServer(principal: ArticlePrincipal) {
  const server = new McpServer({ name: "finance-site-articles", version: "1.1.0" });
  const lookup = z.object({ id: id.optional(), slug: z.string().min(1).max(120).optional() }).strict().refine(p => Boolean(p.id) !== Boolean(p.slug), "必须提供 id 或 slug 之一");
  const transition = z.object({ id, expectedUpdatedAt }).strict();
  const definitions = [
    ["list_articles", "列出当前用户文章；支持分页、分类、搜索、状态和时间筛选。", listArticleToolSchema, "articles:read", true],
    ["get_article", "按 ID 或 slug 读取文章原文和元数据。", lookup, "articles:read", true],
    ["create_article", "创建草稿，永不直接发布。请按用户要求准备来源与数据截止时间。", createArticleToolSchema, "articles:write", false],
    ["update_article", "修改草稿；必须提供最近读取的 expectedUpdatedAt，冲突后请重新读取并与用户核对。", updateArticleToolSchema, "articles:write", false],
    ["preview_article", "返回草稿原文及受管理员登录保护的实际网站预览链接。", lookup, "articles:read", true],
    ["publish_article", "仅在用户明确要求正式发布时调用。将指定文章公开发布，重试幂等。", transition, "articles:publish", false],
    ["unpublish_article", "仅在用户明确要求撤回时调用。文章立即转为草稿。", transition, "articles:unpublish", false],
    ...marketToolDefinitions,
  ] as const;
  const descriptors: Tool[] = [];
  for (const [name, description, schema, scope, readOnly] of definitions) {
    const annotations = { readOnlyHint: readOnly, destructiveHint: name === "publish_article" || name === "unpublish_article" || name === "set_article_cover", idempotentHint: name !== "create_article", openWorldHint: false };
    const securitySchemes = [{ type: "oauth2", scopes: [scope] }];
    const meta = { securitySchemes };
    descriptors.push(Object.assign(ToolSchema.parse({ name, description, inputSchema: z.toJSONSchema(schema, { io: "input" }), annotations, _meta: meta }), { securitySchemes }));
    server.registerTool(name, { description, inputSchema: schema, annotations, _meta: meta }, async (args: Record<string, unknown>) => {
      try {
        const result = JSON.parse(JSON.stringify(await runArticleTool(name, args as Record<string, unknown>, principal)));
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        const code = error instanceof OAuthError ? error.code : error instanceof ArticleConflictError ? "CONFLICT" : error instanceof ArticleToolError || error instanceof MarketError ? error.code : error instanceof z.ZodError ? "INVALID_INPUT" : (error as { code?: string })?.code === "P2002" ? "SLUG_CONFLICT" : "INTERNAL_ERROR";
        const message = error instanceof OAuthError || error instanceof ArticleConflictError || error instanceof ArticleToolError || error instanceof MarketError ? error.message : code === "SLUG_CONFLICT" ? "slug 已存在，请选择其他 slug" : code === "INVALID_INPUT" ? "工具参数无效" : "操作失败，请稍后重试";
        if (code === "INTERNAL_ERROR") console.error("[article-mcp] tool failed", name, error);
        const result = { success: false, error: { code, message } };
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result,
          ...(error instanceof OAuthError ? { _meta: { "mcp/www_authenticate": [challengeHeader(scope)] } } : {}) };
      }
    });
  }
  // SDK v1 only forwards _meta; ChatGPT also requires top-level securitySchemes.
  // Keep SDK validation/execution, and augment discovery using the same schemas.
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: descriptors }));
  return server;
}
