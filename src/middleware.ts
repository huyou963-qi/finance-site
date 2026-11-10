import { NextRequest, NextResponse } from "next/server";
import { REQUEST_ID_HEADER, newRequestId, readRequestId } from "@/lib/observability/requestId";
import {
  LOCALE_COOKIE,
  LOCALE_HEADER,
  PATHNAME_HEADER,
  localizeHref,
  splitLocalePath,
} from "@/i18n/locales";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * 1) 带 Next-Action 头的探测请求直接 404（本站无 Server Action）。
 * 2) 界面语言（docs/I18N.md）：
 *    - /en/... 内部转到同一页面，并在请求头标记 en；同时记住英文偏好（cookie）。
 *    - 记住了英文的访问者打开无前缀页面时，跳到对应的 /en 页面，
 *      让还没改成本地化链接的站内跳转也留在英文。
 *    - 是否对该身份开放英文由根布局判定，未开放会经 /api/i18n/reset 清 cookie 回中文。
 * 3) 其余请求注入/回显 x-request-id，便于错误报告与日志关联。
 */
export function middleware(req: NextRequest) {
  if (req.headers.get("next-action")) {
    return new NextResponse(null, { status: 404 });
  }

  const { locale, pathname } = splitLocalePath(req.nextUrl.pathname);
  if (locale === "en" && isApiPath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  const isPage = !isApiPath(pathname);
  if (
    isPage &&
    locale !== "en" &&
    (req.method === "GET" || req.method === "HEAD") &&
    req.cookies.get(LOCALE_COOKIE)?.value === "en"
  ) {
    // middleware 的重定向必须是绝对地址；host 取请求头（nginx 透传 Host 与 X-Forwarded-Proto）
    const url = req.nextUrl.clone();
    url.pathname = localizeHref(pathname, "en");
    return NextResponse.redirect(url, 307);
  }

  const requestId = readRequestId(req) ?? newRequestId();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set(LOCALE_HEADER, locale);
  requestHeaders.set(PATHNAME_HEADER, pathname);

  let res: NextResponse;
  if (locale === "en") {
    const url = req.nextUrl.clone();
    url.pathname = pathname;
    res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    if (req.cookies.get(LOCALE_COOKIE)?.value !== "en") {
      res.cookies.set(LOCALE_COOKIE, "en", {
        path: "/",
        maxAge: ONE_YEAR_SECONDS,
        sameSite: "lax",
      });
    }
  } else {
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }
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
