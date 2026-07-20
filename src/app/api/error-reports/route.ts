import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyErrorReport } from "@/lib/errorReports/notify";
import { allowRateLimit } from "@/lib/errorReports/rateLimit";
import {
  ERROR_REPORT_SOURCES,
  MAX_DIGEST_LEN,
  MAX_MESSAGE_LEN,
  MAX_PAGE_URL_LEN,
  MAX_STACK_LEN,
  MAX_USER_NOTE_LEN,
  type ErrorReportSource,
} from "@/lib/errorReports/types";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function clip(s: string | undefined | null, max: number): string | undefined {
  if (s == null) return undefined;
  const t = String(s);
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

function isSource(v: unknown): v is ErrorReportSource {
  return typeof v === "string" && (ERROR_REPORT_SOURCES as readonly string[]).includes(v);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      source?: unknown;
      message?: unknown;
      stack?: unknown;
      pageUrl?: unknown;
      userNote?: unknown;
      digest?: unknown;
      metadata?: unknown;
    };

    if (!isSource(body.source)) {
      return NextResponse.json({ error: "source 不合法" }, { status: 400 });
    }
    const message = clip(
      typeof body.message === "string" ? body.message : "",
      MAX_MESSAGE_LEN,
    );
    const pageUrl = clip(
      typeof body.pageUrl === "string" ? body.pageUrl : "",
      MAX_PAGE_URL_LEN,
    );
    if (!message || !pageUrl) {
      return NextResponse.json({ error: "message 与 pageUrl 必填" }, { status: 400 });
    }

    const ip = clientIp(req);
    const rateKey = `${ip}|${body.source}|${message.slice(0, 120)}`;
    if (!allowRateLimit(rateKey, 3, 5 * 60_000)) {
      return NextResponse.json({ error: "上报过于频繁，请稍后再试" }, { status: 429 });
    }

    const me = await getUserByRequest(req).catch(() => null);
    const stack = clip(typeof body.stack === "string" ? body.stack : null, MAX_STACK_LEN);
    const userNote = clip(
      typeof body.userNote === "string" ? body.userNote : null,
      MAX_USER_NOTE_LEN,
    );
    const digest = clip(typeof body.digest === "string" ? body.digest : null, MAX_DIGEST_LEN);
    const userAgent = clip(req.headers.get("user-agent"), 2000);
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as object)
        : undefined;

    const row = await prisma.errorReport.create({
      data: {
        source: body.source,
        message,
        stack: stack ?? null,
        pageUrl,
        userAgent: userAgent ?? null,
        userNote: userNote ?? null,
        digest: digest ?? null,
        userId: me?.id ?? null,
        username: me?.username ?? null,
        metadata: metadata ?? undefined,
      },
    });

    void notifyErrorReport({
      id: row.id,
      source: body.source,
      message,
      pageUrl,
      username: me?.username ?? null,
      digest: digest ?? null,
    });

    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    console.error("[error-reports] POST failed", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
