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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const me = await requireAdmin(req);
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

    const body = (await req.json()) as {
      status?: unknown;
      adminNote?: unknown;
    };

    const data: {
      status?: string;
      adminNote?: string | null;
      resolvedAt?: Date | null;
      resolvedBy?: string | null;
    } = {};

    if (body.status !== undefined) {
      if (!isStatus(body.status)) {
        return NextResponse.json({ error: "status 不合法" }, { status: 400 });
      }
      data.status = body.status;
      if (body.status === "resolved" || body.status === "ignored") {
        data.resolvedAt = new Date();
        data.resolvedBy = me.username;
      } else if (body.status === "open" || body.status === "acknowledged") {
        data.resolvedAt = null;
        data.resolvedBy = null;
      }
    }

    if (body.adminNote !== undefined) {
      if (body.adminNote !== null && typeof body.adminNote !== "string") {
        return NextResponse.json({ error: "adminNote 不合法" }, { status: 400 });
      }
      data.adminNote =
        typeof body.adminNote === "string"
          ? body.adminNote.slice(0, 4000)
          : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "无更新字段" }, { status: 400 });
    }

    const row = await prisma.errorReport.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      report: {
        id: row.id,
        status: row.status,
        adminNote: row.adminNote,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        resolvedBy: row.resolvedBy,
      },
    });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    const code =
      e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2025"
        ? 404
        : status;
    return NextResponse.json(
      { error: code === 404 ? "记录不存在" : message },
      { status: code },
    );
  }
}
