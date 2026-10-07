import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { requireUser } from "@/lib/api/eventAuth";
import {
  createArticleComment,
  listArticleComments,
} from "@/lib/articles/articleCommentStore";

type RouteContext = { params: Promise<{ id: string }> };

function writeErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "评论操作失败";
  if (message.includes("登录")) return NextResponse.json({ error: message }, { status: 401 });
  if (message.includes("评论内容") || message.includes("评论不能")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  console.error("[article-comments] write failed", error);
  return NextResponse.json({ error: "评论操作失败，请稍后重试" }, { status: 500 });
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const viewer = await getUserByRequest(req);
    const result = await listArticleComments((await context.params).id, viewer);
    if (!result) return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[article-comments] list failed", error);
    return NextResponse.json({ error: "评论加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(req);
    const comment = await createArticleComment(
      (await context.params).id,
      user.id,
      await req.json(),
    );
    if (!comment) return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return writeErrorResponse(error);
  }
}
