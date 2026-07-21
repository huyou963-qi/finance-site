import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import { attachmentFilePath } from "@/lib/errorReports/attachments";
import type { ErrorReportMetadata } from "@/lib/errorReports/types";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; index: string }> },
) {
  try {
    await requireAdmin(req);
    const { id, index: indexRaw } = await ctx.params;
    const index = Number(indexRaw);
    if (!id || !Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }

    const row = await prisma.errorReport.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

    const meta = (row.metadata ?? {}) as ErrorReportMetadata;
    const img = meta.images?.[index];
    if (!img?.file) {
      return NextResponse.json({ error: "图片不存在" }, { status: 404 });
    }

    const filePath = attachmentFilePath(id, img.file);
    if (!filePath) {
      return NextResponse.json({ error: "路径无效" }, { status: 400 });
    }

    const buf = await fs.readFile(filePath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": img.mime || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${encodeURIComponent(img.name || img.file)}"`,
      },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "ENOENT") {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}
