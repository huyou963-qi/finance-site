import { cookies } from "next/headers";
import { getAccessUserByToken, SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * 设计预览页（landing/header-menu/timeline preview）默认仅开发环境或管理员可看。
 * 生产临时开放：ALLOW_DESIGN_PREVIEWS=1。
 */
export async function canViewDesignPreview(): Promise<boolean> {
  if (process.env.ALLOW_DESIGN_PREVIEWS === "1") return true;
  if (process.env.NODE_ENV !== "production") return true;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = await getAccessUserByToken(token);
  return user?.role === "admin";
}
