import { NextRequest, NextResponse } from "next/server";
import { getAccessUserByToken, getSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { allowRateLimit } from "@/lib/errorReports/rateLimit";
import { resolveUsageAudience } from "@/lib/analytics/usageAudience";
import { parseUsageCollectBody } from "@/lib/analytics/usageCollect";
import { isAllowedAnalyticsOrigin } from "@/lib/http/sameOrigin";
import { REQUEST_ID_HEADER, resolveRequestId } from "@/lib/observability/requestId";

export const runtime = "nodejs";

/**
 * 取边缘看到的客户端 IP：优先 nginx `X-Real-IP`；
 * `X-Forwarded-For` 取最右侧（由本站反代追加，左侧可被伪造）。
 */
function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const parts = xf.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!;
  }
  return "unknown";
}

export async function POST(req: NextRequest) {
  const requestId = resolveRequestId(req);
  const headers = new Headers({ "Cache-Control": "no-store", [REQUEST_ID_HEADER]: requestId });

  try {
    // 公开写入口：必须同源（或本站 Referer），避免跨站刷埋点
    if (!isAllowedAnalyticsOrigin(req)) {
      return NextResponse.json({ ok: true, dropped: true }, { status: 202, headers });
    }

    const ip = clientIp(req);
    // 按请求次数限流（不依赖可伪造的 guestId）
    if (!allowRateLimit(`usage:req:${ip}`, 60, 60_000)) {
      return NextResponse.json({ ok: true, dropped: true }, { status: 202, headers });
    }

    const body = await req.json().catch(() => null);
    let events;
    try {
      events = parseUsageCollectBody(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求无效";
      return NextResponse.json({ error: message }, { status: 400, headers });
    }
    if (!events.length) {
      return NextResponse.json({ ok: true, inserted: 0 }, { headers });
    }

    const token = getSessionToken(req);
    const access = await getAccessUserByToken(token);
    const audience = resolveUsageAudience(access);
    const userId = access?.id ?? null;

    // 登录用户不依赖客户端 guestId；游客必须带 guestId
    const rows = events
      .map((e) => {
        const guestId = userId ? null : e.guestId;
        if (!userId && !guestId) return null;
        return {
          kind: e.kind,
          audience,
          userId,
          guestId,
          sessionId: e.sessionId,
          path: e.path,
          featureId: e.featureId,
          activeMs: e.activeMs,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    if (!rows.length) {
      return NextResponse.json({ ok: true, inserted: 0 }, { headers });
    }

    // 按行数限流：单 IP + 进程全局预算（不单独信任客户端 guestId）
    if (!allowRateLimit(`usage:rows:${ip}`, 240, 60_000, rows.length)) {
      return NextResponse.json({ ok: true, dropped: true }, { status: 202, headers });
    }
    if (!allowRateLimit("usage:global:rows", 3000, 60_000, rows.length)) {
      return NextResponse.json({ ok: true, dropped: true }, { status: 202, headers });
    }

    await prisma.usageEvent.createMany({ data: rows });
    return NextResponse.json({ ok: true, inserted: rows.length }, { headers });
  } catch (error) {
    console.error("[analytics/collect]", requestId, error);
    // 埋点失败不影响页面：对外成功，避免客户端重试风暴
    return NextResponse.json({ ok: false }, { status: 200, headers });
  }
}
