import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/api/eventAuth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_SOURCE_KIND = new Set(["internal_macro", "internal_market", "external_chart"]);
const MAX_BYTES = 8 * 1024 * 1024;

function optionalUrl(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = value.trim();
  if (url.startsWith("/")) return url;
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("来源地址必须是站内路径或 http(s) URL");
  }
  return url;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const admin = await requireAdmin(req);
    const articleId = (await context.params).id;
    const article = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true } });
    if (!article) return NextResponse.json({ error: "文章不存在" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择图片文件");
    if (!ALLOWED_MIME.has(file.type)) throw new Error("仅支持 PNG、JPEG 或 WebP 图片");
    if (file.size <= 0 || file.size > MAX_BYTES) throw new Error("图片大小必须在 8MB 以内");

    const sourceKindRaw = form.get("sourceKind");
    const sourceKind = typeof sourceKindRaw === "string" ? sourceKindRaw : "";
    if (!ALLOWED_SOURCE_KIND.has(sourceKind)) throw new Error("图表来源类型无效");
    const sourceUrl = optionalUrl(form.get("sourceUrl"));
    if (!sourceUrl) throw new Error("图表来源页面不能为空");

    let sourceConfig: Prisma.InputJsonValue | undefined;
    const sourceConfigRaw = form.get("sourceConfig");
    if (typeof sourceConfigRaw === "string" && sourceConfigRaw.trim()) {
      const parsed = JSON.parse(sourceConfigRaw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("sourceConfig 必须是 JSON 对象");
      }
      sourceConfig = parsed as Prisma.InputJsonValue;
    }

    const capturedAtRaw = form.get("capturedAt");
    const capturedAt =
      typeof capturedAtRaw === "string" && capturedAtRaw
        ? new Date(capturedAtRaw)
        : new Date();
    if (Number.isNaN(capturedAt.getTime())) throw new Error("capturedAt 日期无效");

    const bytes = Buffer.from(await file.arrayBuffer());
    const asset = await prisma.articleAsset.create({
      data: {
        articleId,
        uploadedById: admin.id,
        fileName: file.name.slice(0, 255) || "chart.png",
        mimeType: file.type,
        byteSize: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        data: bytes,
        sourceKind,
        sourceUrl,
        sourceConfig,
        capturedAt,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        byteSize: true,
        sha256: true,
        sourceKind: true,
        sourceUrl: true,
        sourceConfig: true,
        capturedAt: true,
      },
    });
    return NextResponse.json(
      {
        asset: {
          ...asset,
          url: `/api/article-assets/${asset.id}`,
          capturedAt: asset.capturedAt.toISOString(),
        },
        markdown: `![${file.name.replace(/[\[\]]/g, "") || "文章图表"}](/api/article-assets/${asset.id})`,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "图表上传失败";
    const status = message.includes("登录") ? 401 : message.includes("权限") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
