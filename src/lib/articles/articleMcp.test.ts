import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ArticleMarkdown } from "../../components/articles/ArticleMarkdown";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ARTICLE_SCOPES, hashCredential, newCredential, parseScopes, registeredClient, verifyPkce } from "./oauthPolicy";
import { createHash } from "node:crypto";

const prisma = { article: { create() {}, findFirst() {}, findUnique() {}, updateMany() {} },
  user: { findUnique() {} }, weeklyOAuthCredential: { findUnique() {}, updateMany() {}, createMany() {} }, weeklyOAuthGrant: { update() {} }, $transaction() {} };
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma as unknown as PrismaClient;
const modules = import("./articleMcp");

test("generated article client maps SEO fields to research_article", () => {
  const article = Prisma.dmmf.datamodel.models.find(model => model.name === "Article");
  assert.equal(article?.dbName, "research_article");
  assert.equal(article?.fields.find(field => field.name === "seoTitle")?.dbName, "seo_title");
  assert.equal(article?.fields.find(field => field.name === "seoDescription")?.dbName, "seo_description");
});

test("OAuth policy binds registered HTTPS callbacks, scopes and S256 PKCE", () => {
  const old = process.env.ARTICLE_OAUTH_CLIENTS;
  process.env.ARTICLE_OAUTH_CLIENTS = JSON.stringify([{ clientId: "test", name: "Test", redirectUris: ["https://chatgpt.com/callback"] }]);
  try {
    assert.equal(registeredClient("test", "https://chatgpt.com/callback").clientId, "test");
    assert.throws(() => registeredClient("test", "https://chatgpt.com/callback/evil"));
    assert.throws(() => registeredClient("attacker"));
    assert.throws(() => parseScopes("articles:delete"));
    assert.deepEqual(parseScopes("articles:read articles:read"), ["articles:read"]);
    const verifier = newCredential();
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    assert.equal(verifyPkce(verifier, challenge), true);
    assert.equal(verifyPkce(newCredential(), challenge), false);
    assert.equal(verifyPkce("short", challenge), false);
    assert.notEqual(hashCredential(verifier), verifier);
  } finally { if (old === undefined) delete process.env.ARTICLE_OAUTH_CLIENTS; else process.env.ARTICLE_OAUTH_CLIENTS = old; }
});

test("MCP lifecycle enforces draft creation, ownership, scopes, concurrency and idempotent transitions", async t => {
  const { createArticleToolSchema, runArticleTool } = await modules;
  const principal = { userId: "owner", grantId: "grant", scopes: [...ARTICLE_SCOPES] };
  const id = "54a31a40-32f6-4f72-8533-d07855442b6a";
  const base = { title: "GOOG 季报", summary: "摘要", content: "## 估值\n\n分析", category: "earnings", tags: ["GOOG"], sources: ["https://abc.xyz/investor/"], dataCutoff: "2026-10-01T00:00:00.000Z" };
  let row: Record<string, unknown> | null = null;
  t.mock.method(prisma, "$transaction", async (work: unknown) => typeof work === "function" ? work(prisma) : Promise.all(work as Promise<unknown>[]));
  t.mock.method(prisma.article, "create", async ({ data }: { data: Record<string, unknown> }) => {
    row = { ...data, id, createdAt: new Date(), updatedAt: new Date(), author: { username: "owner" }, assets: [] };
    return row;
  });
  t.mock.method(prisma.article, "findFirst", async ({ where }: { where: Record<string, unknown> }) => row && where.authorId === row.authorId ? { id } : null);
  t.mock.method(prisma.article, "findUnique", async () => row);
  t.mock.method(prisma.article, "updateMany", async ({ where, data }: { where: { updatedAt: Date }; data: Record<string, unknown> }) => {
    if (!row || (row.updatedAt as Date).getTime() !== where.updatedAt.getTime()) return { count: 0 };
    row = { ...row, ...data, publishedAt: data.publishedAt === undefined ? row.publishedAt : data.publishedAt };
    return { count: 1 };
  });
  assert.throws(() => createArticleToolSchema.parse({ ...base, status: "published" }));
  await assert.rejects(runArticleTool("create_article", base, { ...principal, scopes: ["articles:read"] }), /缺少权限/);
  const created = await runArticleTool("create_article", base, principal) as { id: string; status: string; updatedAt: string };
  assert.equal(created.status, "draft");
  assert.equal(created.id, id);
  await assert.rejects(runArticleTool("get_article", { id }, { ...principal, userId: "stranger" }), /不属于/);
  const updated = await runArticleTool("update_article", { id, title: "修改标题", expectedUpdatedAt: created.updatedAt }, principal) as { updatedAt: string };
  await assert.rejects(runArticleTool("update_article", { id, title: "过期覆盖", expectedUpdatedAt: created.updatedAt }, principal), /文章已被其他会话修改/);
  const published = await runArticleTool("publish_article", { id, expectedUpdatedAt: updated.updatedAt }, principal) as { success: boolean; changed: boolean; status: string; canonicalUrl: string; updatedAt: string };
  assert.equal(published.success, true);
  assert.equal(published.status, "published");
  assert.match(published.canonicalUrl, /\/articles\//);
  const retry = await runArticleTool("publish_article", { id, expectedUpdatedAt: updated.updatedAt }, principal) as { changed: boolean };
  assert.equal(retry.changed, false);
  await assert.rejects(runArticleTool("update_article", { id, title: "直接改线上", expectedUpdatedAt: published.updatedAt }, principal), /先使用 unpublish/);
  await assert.rejects(runArticleTool("unpublish_article", { id, expectedUpdatedAt: published.updatedAt }, { ...principal, scopes: ["articles:write"] }), /缺少权限/);
  await runArticleTool("unpublish_article", { id, expectedUpdatedAt: published.updatedAt }, principal);
  assert.equal(row!.status, "draft");
  await assert.rejects(runArticleTool("publish_article", { id, expectedUpdatedAt: published.updatedAt }, principal), /文章已被其他会话修改/);
});

test("OAuth token exchange rotates refresh tokens, rejects reuse, audience mismatch and inactive users", async t => {
  await modules;
  const { articleResource, authenticateArticle, exchangeArticleToken } = await import("./articleOAuth");
  const { NextRequest } = await import("next/server");
  const old = process.env.ARTICLE_OAUTH_CLIENTS;
  process.env.ARTICLE_OAUTH_CLIENTS = JSON.stringify([{ clientId: "test", name: "Test", redirectUris: ["https://chatgpt.com/callback"] }]);
  const verifier = newCredential();
  const grant = { id: "grant", userId: "owner", clientId: "test", resource: articleResource(), scope: "articles:read articles:write", expiresAt: new Date(Date.now() + 86400_000), revokedAt: null as Date | null };
  const credential = { kind: "code", grantId: grant.id, grant, expiresAt: new Date(Date.now() + 60_000), consumedAt: null as Date | null, redirectUri: "https://chatgpt.com/callback", codeChallenge: createHash("sha256").update(verifier).digest("base64url") };
  let active = true, issued = 0;
  t.mock.method(prisma.user, "findUnique", async () => ({ id: "owner", username: "owner", role: "admin", status: active ? "active" : "disabled", adminTotpSecret: "configured", plan: "standard" }));
  t.mock.method(prisma.weeklyOAuthCredential, "findUnique", async () => credential);
  t.mock.method(prisma.weeklyOAuthCredential, "updateMany", async () => { if (credential.consumedAt) return { count: 0 }; credential.consumedAt = new Date(); return { count: 1 }; });
  t.mock.method(prisma.weeklyOAuthCredential, "createMany", async () => { issued += 2; return { count: 2 }; });
  t.mock.method(prisma.weeklyOAuthGrant, "update", async () => { grant.revokedAt = new Date(); });
  t.mock.method(prisma, "$transaction", async (work: unknown) => typeof work === "function" ? work(prisma) : null);
  const form = new URLSearchParams({ client_id: "test", grant_type: "authorization_code", code: newCredential(), redirect_uri: credential.redirectUri, code_verifier: verifier, resource: articleResource() });
  try {
    form.set("resource", "https://other.example/mcp");
    await assert.rejects(exchangeArticleToken(form), /resource/);
    form.set("resource", articleResource());
    form.set("code_verifier", newCredential());
    await assert.rejects(exchangeArticleToken(form), /PKCE/);
    form.set("code_verifier", verifier);
    const result = await exchangeArticleToken(form);
    assert.equal(issued, 2);
    assert.equal(result.token_type, "Bearer");
    credential.kind = "refresh"; credential.consumedAt = null;
    form.set("grant_type", "refresh_token"); form.set("refresh_token", result.refresh_token);
    const refreshed = await exchangeArticleToken(form);
    assert.notEqual(result.refresh_token, refreshed.refresh_token);
    await assert.rejects(exchangeArticleToken(form), /凭证重用/);
    assert.ok(grant.revokedAt);
    credential.kind = "access";
    credential.consumedAt = null;
    const req = new NextRequest(articleResource(), { headers: { Authorization: `Bearer ${result.access_token}` } });
    await assert.rejects(authenticateArticle(req), /已过期或撤销/);
    grant.revokedAt = null; active = false;
    await assert.rejects(authenticateArticle(req), /管理员/);
    active = true;
    assert.equal((await authenticateArticle(req)).userId, "owner");
    grant.resource = "https://other.example/mcp";
    await assert.rejects(authenticateArticle(req), /已过期或撤销/);
    await assert.rejects(authenticateArticle(new NextRequest(articleResource())), /授权/);
  } finally { if (old === undefined) delete process.env.ARTICLE_OAUTH_CLIENTS; else process.env.ARTICLE_OAUTH_CLIENTS = old; }
});

test("Official SDK Streamable HTTP discovers seven tools and returns structured permission failures", async () => {
  const { createArticleMcpServer } = await modules;
  const send = async (method: string, params = {}) => {
    const server = createArticleMcpServer({ userId: "owner", grantId: "grant", scopes: ["articles:read"] });
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    try {
    const response = await transport.handleRequest(new Request("https://example.com/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
    assert.equal(response.status, 200);
    return await response.json();
    } finally { await server.close(); }
  };
    const initialized = await send("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "article-test", version: "1.0.0" } });
    assert.equal(initialized.result.serverInfo.name, "finance-site-articles");
    const list = await send("tools/list");
    assert.equal(list.result.tools.length, 7);
    assert.deepEqual(list.result.tools.find((tool: { name: string }) => tool.name === "publish_article").securitySchemes, [{ type: "oauth2", scopes: ["articles:publish"] }]);
    assert.equal(list.result.tools.some((tool: { name: string }) => /delete/.test(tool.name)), false);
    const failure = await send("tools/call", { name: "create_article", arguments: { title: "test", summary: "", content: "", category: "test", tags: [] } });
    assert.equal(failure.result.isError, true);
    assert.equal(failure.result.structuredContent.error.code, "insufficient_scope");
    assert.ok(failure.result._meta["mcp/www_authenticate"]);
});

test("HTTP MCP rejects anonymous writes with OAuth discovery and blocks foreign origins", async () => {
  await modules;
  const { POST } = await import("../../app/api/articles/mcp/route");
  const { NextRequest } = await import("next/server");
  const response = await POST(new NextRequest("https://example.com/api/articles/mcp", { method: "POST" }));
  assert.equal(response.status, 401);
  assert.match(response.headers.get("WWW-Authenticate") ?? "", /oauth-protected-resource\/api\/articles\/mcp/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const blocked = await POST(new NextRequest("https://example.com/api/articles/mcp", { method: "POST", headers: { Origin: "https://evil.example" } }));
  assert.equal(blocked.status, 403);
});

test("Shared article renderer supports tables, footnotes and formulas while neutralizing XSS", () => {
  const content = '# GOOG $150\n\n| 项目 | 值 |\n|---|---|\n| EPS | 2 |\n\n来源[^1]\n\n[^1]: [财报](https://abc.xyz)\n\n$$PV = \\frac{CF}{1+r}$$\n\n<script>alert(1)</script>\n\n[攻击](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>\n\n$$\\href{javascript:alert(1)}{x}$$';
  const html = renderToStaticMarkup(createElement(ArticleMarkdown, { content }));
  assert.match(html, /<table>/);
  assert.match(html, /data-footnotes/);
  assert.match(html, /katex/);
  assert.match(html, /GOOG \$150/);
  assert.doesNotMatch(html, /<script|onerror=|href="javascript:|<img src="x"/);
});
