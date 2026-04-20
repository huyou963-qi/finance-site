import { NextRequest, NextResponse } from "next/server";

/**
 * 示例：服务端转发上游 HTTP，API Key 放在环境变量中，不暴露给浏览器。
 * 调用示例：GET /api/proxy-example?path=v1/some-resource
 */
export async function GET(req: NextRequest) {
  const base = process.env.UPSTREAM_API_BASE?.trim();
  if (!base) {
    return NextResponse.json(
      {
        error:
          "UPSTREAM_API_BASE 未配置。请在 .env.local 中设置上游根地址（勿提交到 Git）。",
      },
      { status: 501 },
    );
  }

  const path = req.nextUrl.searchParams.get("path") ?? "";
  const url = `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

  const upstreamKey = process.env.UPSTREAM_API_KEY?.trim();
  const headers: HeadersInit = { Accept: "application/json" };
  if (upstreamKey) {
    headers.Authorization = `Bearer ${upstreamKey}`;
  }

  const res = await fetch(url, { headers, cache: "no-store" });
  const contentType = res.headers.get("Content-Type") ?? "application/json";
  const body = await res.text();

  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": contentType },
  });
}
