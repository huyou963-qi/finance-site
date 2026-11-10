import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, localizeHref } from "@/i18n/locales";

/**
 * 清掉英文偏好并回到对应的中文页面。
 * 用于：切换回中文；以及英文未对当前身份开放时，根布局把 /en 访问送回中文（避免重定向循环）。
 */
export function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to") ?? "/";
  // 只允许站内路径，防开放重定向
  const safe = to.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\") ? to : "/";
  // 相对地址：不依赖反向代理后看到的 host
  const res = new NextResponse(null, {
    status: 307,
    headers: { Location: localizeHref(safe, "zh"), "Cache-Control": "no-store" },
  });
  res.cookies.set(LOCALE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
