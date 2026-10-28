import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserAccessRecord } from "@/lib/auth";
import { absoluteUrl, getSiteUrl } from "@/lib/seo/siteUrl";
import { ARTICLE_SCOPES, OAuthError, hashCredential, newCredential, parseScopes, registeredClient, verifyPkce, type ArticleScope } from "./oauthPolicy";

export { OAuthError, hashCredential, newCredential, parseScopes, registeredClient };
export const articleResource = () => absoluteUrl("/api/articles/mcp");
export const oauthIssuer = () => absoluteUrl("/api/articles/oauth");
export const resourceMetadataUrl = () => absoluteUrl("/.well-known/oauth-protected-resource/api/articles/mcp");
export const challengeHeader = (scope?: string) => `Bearer resource_metadata="${resourceMetadataUrl()}"${scope ? `, error="insufficient_scope", error_description="Additional article permission required", scope="${scope}"` : ""}`;
export function protectedResourceMetadata() {
  return { resource: articleResource(), authorization_servers: [oauthIssuer()], scopes_supported: ARTICLE_SCOPES, bearer_methods_supported: ["header"] };
}
export function authorizationMetadata() {
  return {
    issuer: oauthIssuer(), authorization_endpoint: `${oauthIssuer()}/authorize`, token_endpoint: `${oauthIssuer()}/token`,
    revocation_endpoint: `${oauthIssuer()}/revoke`, response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"], scopes_supported: ARTICLE_SCOPES,
    authorization_response_iss_parameter_supported: true,
  };
}
export function requireSameOrigin(req: NextRequest) {
  if (req.headers.get("origin") !== new URL(getSiteUrl()).origin) throw new OAuthError("access_denied", "请求来源无效", 403);
}
export type ArticlePrincipal = { userId: string; grantId: string; scopes: string[] };
export async function authenticateArticle(req: NextRequest): Promise<ArticlePrincipal> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.get("authorization") ?? "");
  if (!match) throw new OAuthError("invalid_token", "请连接并授权文章服务", 401);
  const credential = await prisma.weeklyOAuthCredential.findUnique({ where: { hash: hashCredential(match[1]) }, include: { grant: true } });
  const now = Date.now();
  if (!credential || credential.kind !== "access" || credential.consumedAt || credential.expiresAt.getTime() <= now ||
      credential.grant.revokedAt || credential.grant.expiresAt.getTime() <= now || credential.grant.resource !== articleResource()) {
    throw new OAuthError("invalid_token", "文章授权已过期或撤销", 401);
  }
  const user = await getUserAccessRecord(credential.grant.userId);
  if (!user || user.role !== "admin") throw new OAuthError("access_denied", "仅管理员可管理文章", 403);
  return { userId: user.id, grantId: credential.grantId, scopes: credential.grant.scope.split(" ") };
}
export function requireArticleScope(principal: ArticlePrincipal, scope: ArticleScope) {
  if (!principal.scopes.includes(scope)) throw new OAuthError("insufficient_scope", `缺少权限 ${scope}`, 403);
}

/** Opaque credentials, one-time codes, rotated refresh tokens, bound client + resource. */
export async function exchangeArticleToken(form: URLSearchParams) {
  const clientId = form.get("client_id") ?? "";
  registeredClient(clientId);
  if (form.get("resource") !== articleResource()) throw new OAuthError("invalid_target", "resource 必须是文章 MCP 地址");
  const kind = form.get("grant_type");
  if (kind !== "authorization_code" && kind !== "refresh_token") throw new OAuthError("unsupported_grant_type", "不支持该授权方式");
  const raw = form.get(kind === "authorization_code" ? "code" : "refresh_token") ?? "";
  const hash = hashCredential(raw);
  const saved = await prisma.weeklyOAuthCredential.findUnique({ where: { hash }, include: { grant: true } });
  const now = new Date();
  if (!saved || saved.kind !== (kind === "authorization_code" ? "code" : "refresh") || saved.grant.clientId !== clientId ||
      saved.grant.resource !== articleResource() || saved.grant.revokedAt || saved.expiresAt <= now || saved.grant.expiresAt <= now) {
    throw new OAuthError("invalid_grant", "授权凭证无效或已过期");
  }
  if (saved.consumedAt) {
    await prisma.weeklyOAuthGrant.update({ where: { id: saved.grantId }, data: { revokedAt: now } });
    throw new OAuthError("invalid_grant", "检测到凭证重用，请重新授权");
  }
  const user = await getUserAccessRecord(saved.grant.userId);
  if (!user || user.role !== "admin") throw new OAuthError("access_denied", "管理员权限已失效", 403);
  if (kind === "authorization_code" && (saved.redirectUri !== form.get("redirect_uri") || !verifyPkce(form.get("code_verifier") ?? "", saved.codeChallenge ?? ""))) {
    throw new OAuthError("invalid_grant", "回调地址或 PKCE 校验失败");
  }
  if (form.has("scope") && form.get("scope") !== saved.grant.scope) throw new OAuthError("invalid_scope", "刷新时不得更改授权范围");
  const access = newCredential(), refresh = newCredential();
  const expires = new Date(Math.min(now.getTime() + 3600_000, saved.grant.expiresAt.getTime()));
  await prisma.$transaction(async tx => {
    const consumed = await tx.weeklyOAuthCredential.updateMany({ where: { hash, consumedAt: null }, data: { consumedAt: now } });
    if (consumed.count !== 1) throw new OAuthError("invalid_grant", "凭证已被使用");
    await tx.weeklyOAuthCredential.createMany({ data: [
      { hash: hashCredential(access), kind: "access", grantId: saved.grantId, expiresAt: expires },
      { hash: hashCredential(refresh), kind: "refresh", grantId: saved.grantId, expiresAt: saved.grant.expiresAt },
    ] });
  });
  return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: Math.floor((expires.getTime() - now.getTime()) / 1000), scope: saved.grant.scope };
}
