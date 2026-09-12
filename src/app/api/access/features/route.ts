import { NextRequest, NextResponse } from "next/server";
import { listVisibleFeatureIdsForRequest } from "@/lib/access/featureAccess";

export const dynamic = "force-dynamic";

/** 当前访问者（含未登录）可见的功能 id 列表；导航栏据此过滤入口。 */
export async function GET(req: NextRequest) {
  const features = await listVisibleFeatureIdsForRequest(req);
  return NextResponse.json({ features }, { headers: { "Cache-Control": "no-store" } });
}
