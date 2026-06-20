import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";
import { buildAdminDataCatalog } from "@/lib/data/scheduler/adminCatalog";

/** GET /api/admin/data-catalog — 分类树 + 数据源 + 最新值 + 下次更新 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const payload = await buildAdminDataCatalog(prisma);
    return NextResponse.json(payload);
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
