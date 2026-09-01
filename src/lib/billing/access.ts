import type { Role, UserPlan } from "@/lib/auth/types";
import { parseUserPlan } from "@/lib/auth/types";

export type AccessUser = {
  role: Role;
  plan?: UserPlan | string | null;
  planExpiresAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
};

/**
 * 是否启用非 Pro 功能限制。默认启用；只有显式配置为 false/0/no/off 时关闭。
 * 这是服务端开关，不改变用户实际套餐、试用期或管理员角色。
 */
export function nonProFeatureRestrictionsEnabled(
  raw = process.env.NON_PRO_FEATURE_RESTRICTIONS_ENABLED,
): boolean {
  if (!raw?.trim()) return true;
  return !["false", "0", "no", "off"].includes(raw.trim().toLowerCase());
}

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isTrialActive(user: AccessUser, now = Date.now()): boolean {
  const ends = asDate(user.trialEndsAt);
  return Boolean(ends && ends.getTime() > now);
}

export function isPaidProActive(user: AccessUser, now = Date.now()): boolean {
  if (parseUserPlan(user.plan) !== "pro") return false;
  const exp = asDate(user.planExpiresAt);
  if (!exp) return true;
  return exp.getTime() > now;
}

/** 是否 Pro 会员（管理员 / 试用未过期 / 付费未过期） */
export function userHasProAccess(user: AccessUser, now = Date.now()): boolean {
  if (user.role === "admin") return true;
  if (isTrialActive(user, now)) return true;
  return isPaidProActive(user, now);
}

/** 是否可使用受 Pro 门禁保护的功能（支持运维开关临时向普通注册用户开放）。 */
export function userCanAccessProFeatures(
  user: AccessUser,
  now = Date.now(),
  restrictionsEnabled = nonProFeatureRestrictionsEnabled(),
): boolean {
  return !restrictionsEnabled || userHasProAccess(user, now);
}

export function accessSummary(user: AccessUser & { creditBalance?: number }) {
  const now = Date.now();
  const pro = userHasProAccess(user, now);
  const trial = isTrialActive(user, now);
  const paid = isPaidProActive(user, now);
  return {
    hasProAccess: pro,
    isTrial: trial && !paid && user.role !== "admin",
    isPaidPro: paid || user.role === "admin",
  };
}
