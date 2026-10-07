import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/eventAuth";
import { deleteArticleComment } from "@/lib/articles/articleCommentStore";

type RouteContext = { params: Promise<{ id: string; commentId: string }> };

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(req);
    const { id, commentId } = await context.params;
    const result = await deleteArticleComment(id, commentId, user);
    if (result === "missing") {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json({ error: "无权删除这条评论" }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除评论失败";
    if (!message.includes("登录")) console.error("[article-comments] delete failed", error);
    return NextResponse.json(
      { error: message.includes("登录") ? message : "删除评论失败，请稍后重试" },
      { status: message.includes("登录") ? 401 : 500 },
    );
  }
}
