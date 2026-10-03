export type Role = "admin" | "admin_support" | "admin_membership" | "admin_orders" | "user";
export type AdminPermission = "users:read" | "users:write" | "membership:write" | "orders:write" | "analytics:read" | "users:export" | "users:batch";
export const STAFF_ROLES: Role[] = ["admin_support", "admin_membership", "admin_orders"];
export function isStaffRole(role: string): boolean {
  return role === "admin" || STAFF_ROLES.includes(role as Role);
}
export function hasAdminPermission(role: string, permission: AdminPermission): boolean {
  if (role === "admin") return true;
  if (role === "admin_support") return permission === "users:read" || permission === "analytics:read";
  if (role === "admin_membership") return ["users:read", "membership:write", "analytics:read", "users:export", "users:batch"].includes(permission);
  if (role === "admin_orders") return permission === "orders:write" || permission === "users:read";
  return false;
}
export type UserPlan = "standard" | "pro";

export const USER_PLAN_LABELS: Record<UserPlan, string> = {
  standard: "普通用户",
  pro: "Pro 用户",
};

export function parseUserPlan(raw: string | null | undefined): UserPlan {
  return raw === "pro" ? "pro" : "standard";
}

export function validateUserPlan(plan: string): UserPlan {
  const p = plan.trim().toLowerCase();
  if (p === "pro" || p === "standard") return p;
  throw new Error("会员类型不合法");
}
