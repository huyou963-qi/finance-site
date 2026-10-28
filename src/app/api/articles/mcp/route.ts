import { NextRequest, NextResponse, after } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateArticle, challengeHeader, OAuthError } from "@/lib/articles/articleOAuth";
import { createArticleMcpServer } from "@/lib/articles/articleMcp";
import { getSiteUrl } from "@/lib/seo/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    const allowed = new Set([new URL(getSiteUrl()).origin, "https://chatgpt.com", "https://chat.openai.com"]);
    if (origin && !allowed.has(origin)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
    if (Number(req.headers.get("content-length") ?? 0) > 1_000_000) return new NextResponse(null, { status: 413 });
    const principal = await authenticateArticle(req);
    const server = createArticleMcpServer(principal);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 1_000_000 });
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    response.headers.set("Cache-Control", "no-store");
    after(() => server.close());
    return response;
  } catch (error) {
    const e = error instanceof OAuthError ? error : new OAuthError("server_error", "文章服务暂不可用", 500);
    return NextResponse.json({ error: e.code, error_description: e.message }, { status: e.status,
      headers: { "Cache-Control": "no-store", ...(e.status === 401 ? { "WWW-Authenticate": challengeHeader() } : {}) } });
  }
}
// Stateless JSON request/response transport: no persistent SSE session to resume/delete.
export function GET() { return new NextResponse(null, { status: 405, headers: { Allow: "POST" } }); }
export const DELETE = GET;
