import { NextRequest, NextResponse } from "next/server";
import { REQUEST_ID_HEADER, newRequestId, readRequestId } from "@/lib/observability/requestId";

/**
 * 1) 带 Next-Action 头的探测请求直接 404（本站无 Server Action）。
 * 2) 其余请求注入/回显 x-request-id，便于错误报告与日志关联。
 */
export function middleware(req: NextRequest) {
  if (req.headers.get("next-action")) {
    return new NextResponse(null, { status: 404 });
  }

  const requestId = readRequestId(req) ?? newRequestId();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

export const config = {
  matcher: [
    /*
     * 跳过静态资源与 Next 内部；其余页面与 API 均挂 request id。
     * next-action 探测也走此 matcher，在函数内优先 404。
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};
