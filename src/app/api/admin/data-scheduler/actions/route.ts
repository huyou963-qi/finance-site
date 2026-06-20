import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import {
  executeSchedulerAction,
  type SchedulerActionName,
} from "@/lib/data/scheduler/adminActions";
import { prisma } from "@/lib/prisma";

const ALLOWED: SchedulerActionName[] = [
  "sync_calendar",
  "run_worker",
  "run_worker_bis",
  "run_worker_overview",
  "run_worker_estat",
  "reimport_overview_cn",
  "reimport_overview_jp",
  "probe_overview",
  "check_lag_alerts",
  "sync_one",
];

/** POST /api/admin/data-scheduler/actions */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as {
      action?: string;
      instrumentCode?: string;
      limit?: number;
      force?: boolean;
      dryRun?: boolean;
    };
    const action = body.action as SchedulerActionName;
    if (!action || !ALLOWED.includes(action)) {
      return NextResponse.json({ error: "无效 action" }, { status: 400 });
    }
    const result = await executeSchedulerAction(prisma, action, {
      instrumentCode: body.instrumentCode,
      limit: body.limit,
      dryRun: body.dryRun,
      force: body.force ?? (action.startsWith("run_worker") || action.startsWith("reimport_overview")),
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
