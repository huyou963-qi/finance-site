import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { buildQrConnectUrl, getWechatConfig, issueOAuthState } from "@/lib/auth/wechat";
import { wechatResultRedirect } from "../redirect";

export const dynamic = "force-dynamic";

/** 整页跳转到微信扫码页（内嵌二维码加载失败时的兜底入口） */
export async function GET(req: NextRequest) {
  const cfg = getWechatConfig();
  if (!cfg) return wechatResultRedirect({ error: "微信登录未配置" });

  const mode = req.nextUrl.searchParams.get("mode") === "bind" ? "bind" : "login";
  if (mode === "bind" && !(await getUserByRequest(req))) {
    return wechatResultRedirect({ error: "请先登录再绑定微信" });
  }

  const { state, cookie } = issueOAuthState(mode);
  const res = NextResponse.redirect(buildQrConnectUrl(cfg.appId, state));
  res.headers.append("Set-Cookie", cookie);
  return res;
}
