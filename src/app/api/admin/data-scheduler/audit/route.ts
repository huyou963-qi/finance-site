import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/data-scheduler/audit?limit=50&package=&code=
 * 返回 worker 执行批次和 nextRunAt 变更历史，供排查“没有抓取记录”的调度问题。
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));
    const releasePackageId = sp.get("package")?.trim() || undefined;
    const instrumentCode = sp.get("code")?.trim() || undefined;

    const [invocations, scheduleEvents] = await Promise.all([
      prisma.schedulerInvocation.findMany({
        orderBy: { startedAt: "desc" },
        take: limit,
      }),
      prisma.scheduleAuditEvent.findMany({
        where: {
          ...(releasePackageId ? { releasePackageId } : {}),
          ...(instrumentCode
            ? { subscription: { instrument: { code: instrumentCode } } }
            : {}),
        },
        orderBy: { changedAt: "desc" },
        take: limit,
        include: {
          subscription: {
            select: {
              sourceSeriesKey: true,
              instrument: { select: { code: true, name: true } },
            },
          },
          releasePackage: { select: { id: true, labelZh: true } },
        },
      }),
    ]);

    return NextResponse.json({
      invocations,
      scheduleEvents,
      builtAt: new Date().toISOString(),
    });
  } catch (error) {
    const { message, status } = adminErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}
