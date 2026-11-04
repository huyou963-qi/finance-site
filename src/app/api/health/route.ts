import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRequestId } from "@/lib/observability/requestId";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 部署与探活：确认进程可响应且数据库可连。不含密钥或内部细节。 */
export async function GET(req: NextRequest) {
  const requestId = resolveRequestId(req);
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, db: true, ts: new Date().toISOString(), requestId },
      { status: 200, headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, db: false, ts: new Date().toISOString(), requestId },
      { status: 503, headers: { "Cache-Control": "no-store", "x-request-id": requestId } },
    );
  }
}
