import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  getAccessUserByToken,
  getUserAccessRecord,
  getUserByRequest,
} from "@/lib/auth";
import { userHasProAccess } from "@/lib/billing/access";
import {
  defaultFeatureAccessPolicy,
  normalizeFeatureAccessPolicy,
  resolveFeatureAccess,
  viewerFeatureMap,
  type FeatureAccessPolicy,
  type FeatureAccessState,
  type FeatureViewer,
  type ViewerFeatureMap,
} from "@/lib/access/featureCatalog";

const CACHE_TTL_MS = 15_000;

let cache: { policy: FeatureAccessPolicy; at: number } | null = null;

export function invalidateFeatureAccessCache(): void {
  cache = null;
}

/**
 * 读取策略；表不存在或读库失败时退回默认可见性（不让权限表故障打挂全站）。
 * 15 秒内存缓存：导航栏与每个页面守卫都要读，避免每次请求打库。
 */
export async function loadFeatureAccessPolicy(): Promise<FeatureAccessPolicy> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.policy;
  let policy: FeatureAccessPolicy;
  try {
    const row = await prisma.featureAccessPolicy.findUnique({ where: { id: "default" } });
    policy = row ? normalizeFeatureAccessPolicy(row.policy) : defaultFeatureAccessPolicy();
  } catch {
    policy = defaultFeatureAccessPolicy();
  }
  cache = { policy, at: now };
  return policy;
}

export async function saveFeatureAccessPolicy(
  raw: unknown,
  updatedBy?: string | null,
): Promise<FeatureAccessPolicy> {
  const policy = normalizeFeatureAccessPolicy(raw);
  await prisma.featureAccessPolicy.upsert({
    where: { id: "default" },
    create: { id: "default", policy: policy as object, updatedBy: updatedBy ?? null },
    update: { policy: policy as object, updatedBy: updatedBy ?? null },
  });
  invalidateFeatureAccessCache();
  return policy;
}

function toViewer(
  access: { role: "admin" | "user"; plan: string; planExpiresAt: Date | null; trialEndsAt: Date | null } | null,
): FeatureViewer {
  if (!access) return { role: null, hasProAccess: false };
  const hasProAccess = userHasProAccess(access);
  const trialEnded = Boolean(access.trialEndsAt && access.trialEndsAt.getTime() <= Date.now());
  return { role: access.role, hasProAccess, trialEnded };
}

/** 服务端组件 / 页面守卫用：从 cookie 解析访问者身份。 */
export async function getViewerFromCookies(): Promise<FeatureViewer> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
  const access = await getAccessUserByToken(token);
  return toViewer(access);
}

/** Route Handler 用：从请求解析访问者身份。 */
export async function getViewerFromRequest(req: NextRequest): Promise<FeatureViewer> {
  const me = await getUserByRequest(req);
  if (!me) return { role: null, hasProAccess: false };
  const access = await getUserAccessRecord(me.id);
  return toViewer(access);
}

export type FeatureGateResult = {
  allowed: boolean;
  /** 未通过时的原因：hidden（开发中）/ needs-register（游客）/ needs-upgrade（普通用户） */
  state: FeatureAccessState;
  viewer: FeatureViewer;
};

/** 页面守卫：`const gate = await checkFeatureAccess("weekly")`。 */
export async function checkFeatureAccess(featureId: string): Promise<FeatureGateResult> {
  const [policy, viewer] = await Promise.all([
    loadFeatureAccessPolicy(),
    getViewerFromCookies(),
  ]);
  const state = resolveFeatureAccess(policy, featureId, viewer);
  return { allowed: state === "allowed", state, viewer };
}

/** 当前访问者的导航入口（listed）与需要 Pro 的入口（locked）。 */
export async function featureMapForRequest(req: NextRequest): Promise<ViewerFeatureMap> {
  const [policy, viewer] = await Promise.all([
    loadFeatureAccessPolicy(),
    getViewerFromRequest(req),
  ]);
  return viewerFeatureMap(policy, viewer);
}
