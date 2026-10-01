import { handleWeeklyReportMcp } from "@/lib/api/weeklyReportMcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(req: Request) {
  return handleWeeklyReportMcp(req, { expectedToken: process.env.WEEKLY_REPORT_INGEST_TOKEN });
}
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
