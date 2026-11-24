import { NextRequest, NextResponse, after } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { OAuthError } from "@/lib/articles/articleOAuth";
import { getSiteUrl } from "@/lib/seo/siteUrl";
import { authenticateResearch, researchMetadata } from "@/lib/researchMcp/oauth";
import { createResearchMcpServer } from "@/lib/researchMcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const bodyLimit = 64 * 1024;

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    const allowedOrigins = [new URL(getSiteUrl()).origin, "https://chatgpt.com", "https://chat.openai.com"];
    if (origin && !allowedOrigins.includes(origin)) return new NextResponse(null, { status: 403 });
    if (Number(req.headers.get("content-length") ?? 0) > bodyLimit) return new NextResponse(null, { status: 413 });
    const user = await authenticateResearch(req);
    const server = createResearchMcpServer(user);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: bodyLimit,
    });
    await server.connect(transport);
    after(() => server.close());
    const response = await transport.handleRequest(req);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const oauth = error instanceof OAuthError ? error : new OAuthError("server_error", "AI 数据连接暂不可用", 500);
    if (!(error instanceof OAuthError)) console.error("[research-mcp] request failed", error);
    return NextResponse.json({ error: oauth.code, error_description: oauth.message }, {
      status: oauth.status,
      headers: {
        "Cache-Control": "no-store",
        ...(oauth.status === 401 ? { "WWW-Authenticate": `Bearer resource_metadata="${researchMetadata()}"` } : {}),
      },
    });
  }
}

export function GET() { return new NextResponse(null, { status: 405, headers: { Allow: "POST" } }); }
export const DELETE = GET;
