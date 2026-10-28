import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const asset = await prisma.articleAsset.findUnique({
    where: { id: (await context.params).id },
    select: {
      data: true,
      mimeType: true,
      sha256: true,
      sourceKind: true,
      article: { select: { status: true } },
    },
  });
  if (!asset) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  // Chart JSON is served only through its permission-checked renderer; never expose audit/config bytes here.
  if (asset.sourceKind === "chart-reference") return NextResponse.json({ error: "请通过文章图表接口访问" }, { status: 404 });
  if (asset.article.status !== "published") {
    const user = await getUserByRequest(req);
    if (user?.role !== "admin") {
      return NextResponse.json({ error: "无管理员权限" }, { status: user ? 403 : 401 });
    }
  }
  return new NextResponse(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.data.byteLength),
      ETag: `"${asset.sha256}"`,
      "Cache-Control":
        asset.article.status === "published"
          ? "public, max-age=31536000, immutable"
          : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
