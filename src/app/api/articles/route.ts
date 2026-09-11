import { after, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/eventAuth";
import { createArticle, listArticles } from "@/lib/articles/articleStore";
import { pushPublishedArticle } from "@/lib/seo/baiduPush";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "文章操作失败";
  const status = message.includes("登录")
    ? 401
    : message.includes("权限")
      ? 403
      : message.includes("Unique constraint") || message.includes("唯一")
        ? 409
        : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const manage = req.nextUrl.searchParams.get("manage") === "1";
    if (manage) await requireAdmin(req);
    return NextResponse.json({ articles: await listArticles({ manage }) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const article = await createArticle(await req.json(), admin.id);
    if (article.status === "published") after(() => pushPublishedArticle(article.slug));
    return NextResponse.json({ article }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
