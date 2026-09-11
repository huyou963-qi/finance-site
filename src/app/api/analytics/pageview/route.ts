import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { allowRateLimit } from "@/lib/errorReports/rateLimit";
import {
  deviceTypeFromUserAgent,
  isBotUserAgent,
  isTrackedPath,
  isValidClientId,
  normalizePath,
  referrerHost,
} from "@/lib/analytics/pageView";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

const noContent = () => new NextResponse(null, { status: 204 });

/** 页面浏览埋点。爬虫、管理员、后台路径静默丢弃（204）。 */
export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get("user-agent");
    if (isBotUserAgent(ua)) return noContent();

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(await req.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "请求体不合法" }, { status: 400 });
    }

    const path = normalizePath(body.path);
    if (!path || !isValidClientId(body.visitorId) || !isValidClientId(body.sessionId)) {
      return NextResponse.json({ error: "path / visitorId / sessionId 不合法" }, { status: 400 });
    }
    if (!isTrackedPath(path)) return noContent();

    if (!allowRateLimit(`pageview|${clientIp(req)}`, 120, 60_000)) {
      return NextResponse.json({ error: "过于频繁" }, { status: 429 });
    }

    const me = await getUserByRequest(req).catch(() => null);
    // 站长自己的浏览不计入
    if (me?.role === "admin") return noContent();

    const isEntry = body.isEntry === true;
    await prisma.pageView.create({
      data: {
        path,
        visitorId: body.visitorId,
        sessionId: body.sessionId,
        isEntry,
        referrerHost: isEntry ? referrerHost(body.referrer, req.headers.get("host")) : null,
        device: deviceTypeFromUserAgent(ua),
        userId: me?.id ?? null,
      },
    });
    return noContent();
  } catch (e) {
    console.error("[analytics] pageview insert failed", e);
    return NextResponse.json({ error: "记录失败" }, { status: 500 });
  }
}
