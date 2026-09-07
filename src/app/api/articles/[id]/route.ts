import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/eventAuth";
import {
  deleteArticle,
  getArticleById,
  updateArticle,
} from "@/lib/articles/articleStore";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "文章操作失败";
  const status = message.includes("登录")
    ? 401
    : message.includes("权限")
      ? 403
      : message.includes("Unique constraint")
        ? 409
        : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const article = await getArticleById((await context.params).id);
    if (!article) return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    return NextResponse.json({ article });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const article = await updateArticle((await context.params).id, await req.json());
    if (!article) return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    return NextResponse.json({ article });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    await requireAdmin(req);
    const deleted = await deleteArticle((await context.params).id);
    if (!deleted) return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
