import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth/requireAdmin";
import { getUserLifecycleAnalytics } from "@/lib/auth/userLifecycleAnalytics";

export async function GET(req: NextRequest) {
  try {
    await requireAdminPermission(req, "analytics:read");
    return NextResponse.json(await getUserLifecycleAnalytics(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "加载失败";
    return NextResponse.json({ error: message }, { status: message.includes("未登录") ? 401 : message.includes("权限") ? 403 : 500 });
  }
}
