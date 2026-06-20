import type { NextRequest } from "next/server";
import { getUserByRequest } from "@/lib/auth";

export async function requireAdmin(req: NextRequest) {
  const me = await getUserByRequest(req);
  if (!me) throw new Error("未登录");
  if (me.role !== "admin") throw new Error("无管理员权限");
  return me;
}

export function adminErrorResponse(e: unknown): { message: string; status: number } {
  const msg = e instanceof Error ? e.message : "未知错误";
  const status = msg.includes("未登录") ? 401 : msg.includes("权限") ? 403 : 500;
  return { message: msg, status };
}
