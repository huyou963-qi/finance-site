import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/eventAuth";
import { requireWeeklyReportIngest } from "@/lib/api/weeklyReportAuth";
import {
  listWeeklyReports,
  parseWeeklyReportMeta,
  upsertWeeklyReport,
} from "@/lib/data/weeklyReports";

function weeklyApiError(e: unknown) {
  const base = apiErrorResponse(e);
  const msg = base.msg;
  const status =
    msg.includes("ingest") || msg.includes("凭证") || msg.includes("WEEKLY_REPORT_INGEST_TOKEN")
      ? 401
      : base.status;
  return { msg, status };
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
    const offset = sp.get("offset") ? Number(sp.get("offset")) : undefined;
    const result = await listWeeklyReports({ limit, offset });
    return NextResponse.json(result);
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    requireWeeklyReportIngest(req);
    const body = (await req.json()) as {
      meta?: unknown;
      bodyMarkdown?: string;
    };
    const meta = parseWeeklyReportMeta(body.meta);
    const { report, created } = await upsertWeeklyReport({
      meta,
      bodyMarkdown: body.bodyMarkdown ?? "",
    });
    return NextResponse.json(
      { id: report.id, weekEnding: report.weekEnding, report },
      { status: created ? 201 : 200 },
    );
  } catch (e) {
    const { msg, status } = weeklyApiError(e);
    return NextResponse.json({ error: msg }, { status });
  }
}
