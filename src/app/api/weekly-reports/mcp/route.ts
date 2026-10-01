import { weeklyStore } from "@/lib/oauth/weeklyStore";
import { handleWeeklyReportMcp } from "@/lib/api/weeklyReportMcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(req: Request) {
  return handleWeeklyReportMcp(req, { ingestToken: process.env.WEEKLY_REPORT_INGEST_TOKEN, authenticate: weeklyStore().authenticate });
}
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
