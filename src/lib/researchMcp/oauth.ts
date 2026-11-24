import type { NextRequest } from "next/server";
import { getAccessUserByToken, getSessionToken, getUserAccessRecord } from "@/lib/auth";
import { isPaidProActive } from "@/lib/billing/access";
import { normalizeFeatureAccessPolicy, resolveFeatureAccess } from "@/lib/access/featureCatalog";
import { exchangeOAuthToken, hashCredential, OAuthError, registeredClient } from "@/lib/articles/articleOAuth";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/seo/siteUrl";

export const researchScope = "research:read";
export const personalReadScope = "research:personal:read";
export const personalWriteScope = "research:personal:write";
export const researchScopes = [researchScope, personalReadScope, personalWriteScope] as const;
export type ResearchScope = typeof researchScopes[number];

export function parseResearchScopes(raw: string | null): ResearchScope[] {
  const scopes = [...new Set((raw ?? researchScope).split(/\s+/).filter(Boolean))];
  if (!scopes.includes(researchScope) || scopes.some(scope => !researchScopes.includes(scope as ResearchScope))) {
    throw new OAuthError("invalid_scope", "请求的 AI 数据权限无效");
  }
  return scopes as ResearchScope[];
}

export const researchResource = () => absoluteUrl("/api/mcp");
export const researchIssuer = () => absoluteUrl("/api/mcp/oauth");
export const researchMetadata = () => absoluteUrl("/.well-known/oauth-protected-resource/api/mcp");
export const researchScopeChallenge = (scope: ResearchScope) =>
  `Bearer resource_metadata="${researchMetadata()}", error="insufficient_scope", scope="${researchScope} ${scope}"`;

export const researchClient = (id: string, redirect?: string) =>
  registeredClient(id, redirect, process.env.RESEARCH_MCP_OAUTH_CLIENTS ?? "[]");

type User = NonNullable<Awaited<ReturnType<typeof getUserAccessRecord>>>;
const researchFeatures = [
  "macro", "equity-stock-data", "markets", "equity-ownership", "equity-industries",
  "articles", "weekly", "events", "quant-screener", "forecast-us-cpi", "forecast-us-nfp", "forecast-us-gdp",
] as const;
export type ResearchFeature = typeof researchFeatures[number];
export type ResearchPrincipal = User & { enabledFeatures: ResearchFeature[]; scopes: ResearchScope[] };

export function requireResearchEntitlement(user: User | null): User {
  if (!user) throw new OAuthError("invalid_token", "请登录网站并授权数据连接", 401);
  if (user.role !== "admin" && !isPaidProActive(user)) {
    throw new OAuthError("pro_required", "AI 数据连接需要有效的 Pro 订阅", 403);
  }
  return user;
}

async function authorizeUser(user: User | null): Promise<Omit<ResearchPrincipal, "scopes">> {
  const eligible = requireResearchEntitlement(user);
  const row = await prisma.featureAccessPolicy.findUnique({ where: { id: "default" } });
  const policy = normalizeFeatureAccessPolicy(row?.policy);
  const viewer = { role: eligible.role === "admin" ? "admin" as const : "user" as const, hasProAccess: true };
  const connectionEnabled = eligible.role === "admin" || policy.features["research-mcp"]?.status === "released";
  if (!connectionEnabled) {
    throw new OAuthError("feature_unavailable", "此数据功能暂未开放", 403);
  }
  const enabledFeatures = researchFeatures.filter(feature => resolveFeatureAccess(policy, feature, viewer) === "allowed");
  return { ...eligible, enabledFeatures };
}

export const researchUserBySession = async (req: NextRequest) =>
  authorizeUser(await getAccessUserByToken(getSessionToken(req)));

export function exchangeResearchToken(form: URLSearchParams) {
  return exchangeOAuthToken(form, {
    resource: researchResource,
    registeredClient: researchClient,
    checkUser: async id => authorizeUser(await getUserAccessRecord(id)),
  });
}

export async function authenticateResearch(req: NextRequest): Promise<ResearchPrincipal> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.get("authorization") ?? "");
  if (!match) throw new OAuthError("invalid_token", "请先授权 AI 数据连接", 401);
  const credential = await prisma.weeklyOAuthCredential.findUnique({
    where: { hash: hashCredential(match[1]) },
    include: { grant: true },
  });
  const now = Date.now();
  if (!credential || credential.kind !== "access" || credential.consumedAt ||
      credential.expiresAt.getTime() <= now || credential.grant.revokedAt ||
      credential.grant.expiresAt.getTime() <= now || credential.grant.resource !== researchResource()) {
    throw new OAuthError("invalid_token", "授权无效、已过期或已撤销", 401);
  }
  researchClient(credential.grant.clientId);
  let scopes: ResearchScope[];
  try { scopes = parseResearchScopes(credential.grant.scope); }
  catch { throw new OAuthError("invalid_token", "授权权限无效，请重新连接", 401); }
  return { ...await authorizeUser(await getUserAccessRecord(credential.grant.userId)), scopes };
}
