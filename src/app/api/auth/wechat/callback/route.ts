import { NextRequest } from "next/server";
import { bindWechatToUser, getUserByRequest, loginOrRegisterWechat } from "@/lib/auth";
import {
  clearOAuthStateCookie,
  consumeOAuthState,
  exchangeCodeForIdentity,
} from "@/lib/auth/wechat";
import { wechatResultRedirect } from "../redirect";

export const dynamic = "force-dynamic";

/** 微信授权回调：code + state → 登录 / 自动注册 / 绑定当前账号 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const mode = consumeOAuthState(req, req.nextUrl.searchParams.get("state"));

  const finish = (res: ReturnType<typeof wechatResultRedirect>) => {
    res.headers.append("Set-Cookie", clearOAuthStateCookie());
    return res;
  };

  // 用户在手机上点了「取消」时微信不带 code
  if (!code) return finish(wechatResultRedirect({ error: "已取消微信授权" }));
  if (!mode) return finish(wechatResultRedirect({ error: "二维码已过期，请刷新后重新扫码" }));

  try {
    const identity = await exchangeCodeForIdentity(code);

    if (mode === "bind") {
      const me = await getUserByRequest(req);
      if (!me) return finish(wechatResultRedirect({ error: "登录已失效，请重新登录后绑定" }));
      await bindWechatToUser(me.id, identity);
      return finish(wechatResultRedirect({ status: "bound" }));
    }

    const { cookie, created } = await loginOrRegisterWechat(identity);
    const res = created
      ? wechatResultRedirect({ status: "welcome" })
      : wechatResultRedirect({ path: "/" });
    res.headers.append("Set-Cookie", cookie);
    return finish(res);
  } catch (e) {
    const message = e instanceof Error ? e.message : "微信登录失败";
    console.error("[wechat] callback failed:", message);
    return finish(wechatResultRedirect({ error: message }));
  }
}
