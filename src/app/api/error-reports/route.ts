import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveErrorReportImages, type IncomingImage } from "@/lib/errorReports/attachments";
import { notifyErrorReport } from "@/lib/errorReports/notify";
import { allowRateLimit } from "@/lib/errorReports/rateLimit";
import {
  ERROR_REPORT_SOURCES,
  MAX_DIGEST_LEN,
  MAX_IMAGES,
  MAX_MESSAGE_LEN,
  MAX_PAGE_URL_LEN,
  MAX_STACK_LEN,
  MAX_USER_NOTE_LEN,
  type ErrorReportMetadata,
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

function parseImages(raw: unknown): IncomingImage[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) throw new Error("images 须为数组");
  if (raw.length > MAX_IMAGES) throw new Error(`最多上传 ${MAX_IMAGES} 张图片`);
  return raw.map((item, i) => {
    if (!item || typeof item !== "object") throw new Error(`images[${i}] 不合法`);
    const o = item as Record<string, unknown>;
    const mime = typeof o.mime === "string" ? o.mime : "";
    const name = typeof o.name === "string" ? o.name : `image-${i}`;
    let dataBase64 = "";
    if (typeof o.dataBase64 === "string") {
      dataBase64 = o.dataBase64;
    } else if (typeof o.dataUrl === "string") {
      const m = /^data:([^;]+);base64,(.+)$/i.exec(o.dataUrl);
      if (!m) throw new Error(`images[${i}] dataUrl 无效`);
      dataBase64 = m[2] ?? "";
      if (!mime && m[1]) {
        return { name, mime: m[1], dataBase64 };
      }
    } else {
      throw new Error(`images[${i}] 缺少图片数据`);
    }
    return { name, mime, dataBase64 };
  });
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
      images?: unknown;
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

    let incomingImages: IncomingImage[] | undefined;
    try {
      incomingImages = parseImages(body.images);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "图片不合法" },
        { status: 400 },
      );
    }

    const me = await getUserByRequest(req).catch(() => null);
    const stack = clip(typeof body.stack === "string" ? body.stack : null, MAX_STACK_LEN);
    const userNote = clip(
      typeof body.userNote === "string" ? body.userNote : null,
      MAX_USER_NOTE_LEN,
    );
    const digest = clip(typeof body.digest === "string" ? body.digest : null, MAX_DIGEST_LEN);
    const userAgent = clip(req.headers.get("user-agent"), 2000);

    const baseMeta: ErrorReportMetadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? { ...(body.metadata as ErrorReportMetadata) }
        : {};
    if (body.source === "manual_feature") baseMeta.feedbackKind = "feature";
    else if (body.source === "manual") baseMeta.feedbackKind = "bug";

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
        metadata: baseMeta as unknown as Prisma.InputJsonValue,
      },
    });

    try {
      const saved = await saveErrorReportImages(row.id, incomingImages);
      if (saved.length > 0) {
        const metadata: ErrorReportMetadata = { ...baseMeta, images: saved };
        await prisma.errorReport.update({
          where: { id: row.id },
          data: { metadata: metadata as unknown as Prisma.InputJsonValue },
        });
      }
    } catch (e) {
      console.error("[error-reports] image save failed", e);
      return NextResponse.json(
        {
          id: row.id,
          error: e instanceof Error ? e.message : "图片保存失败（文字反馈已入库）",
        },
        { status: 201 },
      );
    }

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
