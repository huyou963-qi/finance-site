import { NextRequest } from "next/server";

export function requireWeeklyReportIngest(req: NextRequest): void {
  const expected = process.env.WEEKLY_REPORT_INGEST_TOKEN?.trim();
  if (!expected) {
    throw new Error("服务端未配置 WEEKLY_REPORT_INGEST_TOKEN");
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return;
  const header = req.headers.get("x-weekly-ingest-token");
  if (header === expected) return;
  throw new Error("无效的 ingest 凭证");
}
