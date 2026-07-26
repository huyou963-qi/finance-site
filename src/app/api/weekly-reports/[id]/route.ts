import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, requireAdmin } from "@/lib/api/eventAuth";
import { getUserByRequest, getUserAccessRecord } from "@/lib/auth";
import { userHasProAccess } from "@/lib/billing/access";
import { deleteWeeklyReport, getWeeklyReportById } from "@/lib/data/weeklyReports";

type RouteCtx = { params: Promise<{ id: string }> };

function truncateMarkdown(md: string, maxChars = 480): string {
  const t = md.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars).trimEnd()}…\n\n（升级 Pro 后可阅读全文）`;
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    const me = await getUserByRequest(req);
    if (!me) {
      return NextResponse.json(
        { error: "请先登录后查看 AI 周度观察", code: "NEEDS_LOGIN", pricingPath: "/pricing" },
        { status: 401 },
      );
    }
    const access = await getUserAccessRecord(me.id);
    const hasPro = Boolean(access && userHasProAccess(access));

    const { id } = await ctx.params;
    const report = await getWeeklyReportById(id);
    if (!report) {
      return NextResponse.json({ error: "周报不存在" }, { status: 404 });
    }

    if (!hasPro) {
      return NextResponse.json({
        report: {
          ...report,
          bodyMarkdown: truncateMarkdown(report.bodyMarkdown),
        },
        hasProAccess: false,
        truncated: true,
        code: "NEEDS_PRO",
        pricingPath: "/pricing",
      });
    }

    return NextResponse.json({ report, hasProAccess: true, truncated: false });
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
