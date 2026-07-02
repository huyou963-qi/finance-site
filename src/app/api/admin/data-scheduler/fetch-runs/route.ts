import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import { listRecentFetchRuns } from "@/lib/data/scheduler/adminActions";
import { prisma } from "@/lib/prisma";

/** GET /api/admin/data-scheduler/fetch-runs?limit=20&code=&package=&packageSyncId= */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 20));
    const instrumentCode = sp.get("code") ?? sp.get("instrumentCode") ?? undefined;
    const releasePackageId = sp.get("package") ?? sp.get("releasePackageId") ?? undefined;
    const packageSyncId = sp.get("packageSyncId") ?? undefined;
    const rows = await listRecentFetchRuns(prisma, {
      instrumentCode,
      releasePackageId,
      packageSyncId,
      limit,
    });
    return NextResponse.json({ rows, builtAt: new Date().toISOString() });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
