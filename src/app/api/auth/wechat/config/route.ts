import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { getWechatConfig, issueOAuthState, wechatCallbackUrl } from "@/lib/auth/wechat";

export const dynamic = "force-dynamic";

/** 内嵌二维码（wxLogin.js）所需参数；每次调用签发新的 state cookie */
export async function GET(req: NextRequest) {
  const cfg = getWechatConfig();
  if (!cfg) return NextResponse.json({ enabled: false });
  // 仅探测是否开启（决定是否展示微信入口），不签发 state
  if (req.nextUrl.searchParams.get("probe") === "1") return NextResponse.json({ enabled: true });

  const mode = req.nextUrl.searchParams.get("mode") === "bind" ? "bind" : "login";
  if (mode === "bind" && !(await getUserByRequest(req))) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { state, cookie } = issueOAuthState(mode);
  const res = NextResponse.json({
    enabled: true,
    appId: cfg.appId,
    redirectUri: wechatCallbackUrl(),
    state,
  });
  res.headers.append("Set-Cookie", cookie);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
