import { NextRequest, NextResponse } from "next/server";
import { featureMapForRequest } from "@/lib/access/featureAccess";

export const dynamic = "force-dynamic";

/**
 * 当前访问者（含游客）的导航入口：
 * - features：应展示的功能 id（开发中且不可见的已排除）
 * - locked：展示但需要 Pro 的功能 id（导航加 Pro 标记，点进去是注册/升级引导）
 */
export async function GET(req: NextRequest) {
  const { listed, locked } = await featureMapForRequest(req);
  return NextResponse.json(
    { features: listed, locked },
    { headers: { "Cache-Control": "no-store" } },
  );
}
