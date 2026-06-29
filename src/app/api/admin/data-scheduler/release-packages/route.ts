import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma";
import {
  calendarSpecForPackageRow,
  parsePackageScheduleState,
} from "@/lib/data/scheduler/releasePackageStore";

/** GET /api/admin/data-scheduler/release-packages */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const rows = await prisma.releasePackage.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        _count: { select: { members: true, subscriptions: true } },
      },
    });
    return NextResponse.json({
      builtAt: new Date().toISOString(),
      packages: rows.map((p) => ({
        id: p.id,
        labelZh: p.labelZh,
        labelEn: p.labelEn,
        countryCode: p.countryCode,
        agencyId: p.agencyId,
        granularity: p.granularity,
        calendarSpec: calendarSpecForPackageRow(p),
        scheduleState: parsePackageScheduleState(p.scheduleState),
        nextRunAt: p.nextRunAt?.toISOString() ?? null,
        enabled: p.enabled,
        memberCount: p._count.members,
        subscriptionCount: p._count.subscriptions,
      })),
    });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
