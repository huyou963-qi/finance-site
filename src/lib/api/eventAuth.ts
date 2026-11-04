import { NextRequest } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import {
  requireAdmin as requireCanonicalAdmin,
  adminErrorResponse,
} from "@/lib/auth/requireAdmin";

export async function requireUser(req: NextRequest) {
  const user = await getUserByRequest(req);
  if (!user) throw new Error("请先登录");
  return user;
}

/**
 * 统一到 `@/lib/auth/requireAdmin`（含员工必须已绑定 TOTP 的会话语义）。
 * 对外仍抛「请先登录」以兼容既有 apiErrorResponse 文案分支。
 */
export async function requireAdmin(req: NextRequest) {
  try {
    return await requireCanonicalAdmin(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("未登录")) throw new Error("请先登录");
    throw error;
  }
}

export function apiErrorResponse(e: unknown, fallback = "未知错误") {
  const msg = e instanceof Error ? e.message : fallback;
  const status = msg.includes("请先登录") || msg.includes("未登录")
    ? 401
    : msg.includes("管理员") || msg.includes("权限")
      ? 403
      : msg.includes("不存在")
        ? 404
        : 400;
  return { msg, status };
}

export { adminErrorResponse };
