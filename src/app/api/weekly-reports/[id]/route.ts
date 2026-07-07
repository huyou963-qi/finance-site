import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, requireAdmin } from "@/lib/api/eventAuth";
import { deleteWeeklyReport, getWeeklyReportById } from "@/lib/data/weeklyReports";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const report = await getWeeklyReportById(id);
    if (!report) {
      return NextResponse.json({ error: "周报不存在" }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const deleted = await deleteWeeklyReport(id);
    if (!deleted) {
      return NextResponse.json({ error: "周报不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
