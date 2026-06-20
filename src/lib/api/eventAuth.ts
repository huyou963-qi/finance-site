import { NextRequest } from "next/server";
import { getUserByRequest, type Role } from "@/lib/auth";

export async function requireUser(req: NextRequest) {
  const user = await getUserByRequest(req);
  if (!user) throw new Error("请先登录");
  return user;
}

export async function requireAdmin(req: NextRequest) {
  const user = await requireUser(req);
  if (user.role !== ("admin" as Role)) throw new Error("无管理员权限");
  return user;
}

export function apiErrorResponse(e: unknown, fallback = "未知错误") {
  const msg = e instanceof Error ? e.message : fallback;
  const status = msg.includes("请先登录")
    ? 401
    : msg.includes("管理员")
      ? 403
      : msg.includes("不存在")
        ? 404
        : 400;
  return { msg, status };
}
