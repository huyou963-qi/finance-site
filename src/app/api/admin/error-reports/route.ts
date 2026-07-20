import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import {
  ERROR_REPORT_STATUSES,
  type ErrorReportStatus,
} from "@/lib/errorReports/types";

export const runtime = "nodejs";

function isStatus(v: unknown): v is ErrorReportStatus {
  return typeof v === "string" && (ERROR_REPORT_STATUSES as readonly string[]).includes(v);
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const statusRaw = searchParams.get("status");
    const take = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "50") || 50));
    const where =
      statusRaw && isStatus(statusRaw) ? { status: statusRaw } : undefined;

    const reports = await prisma.errorReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
    });

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        status: r.status,
        source: r.source,
        message: r.message,
        stack: r.stack,
        pageUrl: r.pageUrl,
        userAgent: r.userAgent,
        userNote: r.userNote,
        digest: r.digest,
        userId: r.userId,
        username: r.username,
        metadata: r.metadata,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        resolvedBy: r.resolvedBy,
        adminNote: r.adminNote,
      })),
    });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
