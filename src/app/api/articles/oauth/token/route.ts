import { NextRequest, NextResponse } from "next/server";
import { exchangeArticleToken, OAuthError } from "@/lib/articles/articleOAuth";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new OAuthError("invalid_request", "需要 form-urlencoded 请求");
    return NextResponse.json(await exchangeArticleToken(new URLSearchParams(await req.text())), { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  } catch (error) {
    const e = error instanceof OAuthError ? error : new OAuthError("server_error", "授权服务暂不可用", 500);
    return NextResponse.json({ error: e.code, error_description: e.message }, { status: e.status, headers: { "Cache-Control": "no-store" } });
  }
}
