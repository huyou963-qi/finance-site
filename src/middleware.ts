import { NextResponse } from "next/server";

/**
 * 本站没有任何 Server Action（全仓无 "use server"）。扫描器大量伪造 Next-Action 头 POST 页面
 * （React2Shell 类探测；本站 Next 版本已修补），Next 每次都会打一条
 * "Failed to find Server Action" 错误日志。这类请求在进入 Next 动作解析前直接 404。
 * matcher 只匹配带该头的请求，普通访问不经过 middleware。以后若引入 Server Action，删除本文件。
 */
export function middleware() {
  return new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: [{ source: "/:path*", has: [{ type: "header", key: "next-action" }] }],
};
