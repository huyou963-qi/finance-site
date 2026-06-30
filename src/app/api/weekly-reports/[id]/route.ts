import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, requireUser } from "@/lib/api/eventAuth";
import { getWeeklyReportById } from "@/lib/data/weeklyReports";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    await requireUser(req);
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
