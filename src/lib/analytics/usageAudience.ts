import { isStaffRole, type Role } from "@/lib/auth/types";
import { userHasProAccess, type AccessUser } from "@/lib/billing/access";
import type { UsageAudience } from "@/lib/analytics/usageTypes";

/**
 * 埋点受众：后台人员一律记为 admin（产品指标默认排除）；
 * 其余按是否享有 Pro（试用/付费）分为 pro / standard；未登录为 guest。
 */
export function resolveUsageAudience(
  user: (AccessUser & { role: Role }) | null | undefined,
  now = Date.now(),
): UsageAudience {
  if (!user) return "guest";
  if (isStaffRole(user.role)) return "admin";
  if (userHasProAccess(user, now)) return "pro";
  return "standard";
}
