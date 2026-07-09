import { NextRequest } from "next/server";

/** 复用周报 ingest token；也可单独配置 EQUITY_INGEST_TOKEN */
export function requireEquityIngest(req: NextRequest): void {
  const expected =
    process.env.EQUITY_INGEST_TOKEN?.trim() ||
    process.env.WEEKLY_REPORT_INGEST_TOKEN?.trim();
  if (!expected) {
    throw new Error("服务端未配置 EQUITY_INGEST_TOKEN 或 WEEKLY_REPORT_INGEST_TOKEN");
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return;
  const header =
    req.headers.get("x-equity-ingest-token") ||
    req.headers.get("x-weekly-ingest-token");
  if (header === expected) return;
  throw new Error("无效的 ingest 凭证");
}
