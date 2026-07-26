export type Role = "admin" | "user";
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
