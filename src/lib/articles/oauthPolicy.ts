import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ARTICLE_SCOPES = ["articles:read", "articles:write", "articles:publish", "articles:unpublish"] as const;
export type ArticleScope = typeof ARTICLE_SCOPES[number];
export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export const hashCredential = (value: string) => createHash("sha256").update(value).digest("hex");
export const newCredential = () => randomBytes(32).toString("base64url");
export function verifyPkce(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed.length === challenge.length && timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}
export function parseScopes(raw: string): ArticleScope[] {
  const scopes = [...new Set(raw.split(/\s+/).filter(Boolean))];
  if (!scopes.length || scopes.some(s => !ARTICLE_SCOPES.includes(s as ArticleScope))) {
    throw new OAuthError("invalid_scope", "请求的文章权限无效");
  }
  return scopes as ArticleScope[];
}
/** Explicit public-client registration. Never fetch arbitrary client metadata URLs. */
export function registeredClient(id: string, redirectUri?: string) {
  const clients = JSON.parse(process.env.ARTICLE_OAUTH_CLIENTS ?? "[]") as { clientId: string; name: string; redirectUris: string[] }[];
  const client = clients.find(c => c.clientId === id);
  if (!client) throw new OAuthError("invalid_client", "OAuth 客户端未登记", 401);
  if (redirectUri !== undefined) {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" || url.hash || url.username || url.password || !client.redirectUris.includes(redirectUri)) {
      throw new OAuthError("invalid_request", "回调地址不在允许列表中");
    }
  }
  return client;
}
