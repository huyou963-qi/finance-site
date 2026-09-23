import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import type { WechatIdentity } from "@/lib/auth";

/**
 * 微信开放平台「网站应用」扫码登录（OAuth2，scope=snsapi_login）。
 * 文档：https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
 *
 * 流程：页面内嵌 wxLogin.js 二维码（或整页跳 qrconnect）→ 用户手机微信确认 →
 * 微信把顶层窗口跳到 `${APP_BASE_URL}/api/auth/wechat/callback?code&state` →
 * 服务端校验 state、用 code 换 access_token + openid/unionid → 登录 / 注册 / 绑定。
 *
 * env 一律在请求时读取（不要提到模块顶层：预渲染会把 CI 的值固化进产物）。
 * 回调域名须与开放平台后台「授权回调域」一致（只填域名，不带协议与路径）。
 */

export type WechatOAuthMode = "login" | "bind";

const STATE_COOKIE = "finance_wx_state";
const STATE_TTL_SECONDS = 10 * 60;
const CALLBACK_PATH = "/api/auth/wechat/callback";

export function getWechatConfig(): { appId: string; secret: string } | null {
  const appId = process.env.WECHAT_OPEN_APPID?.trim();
  const secret = process.env.WECHAT_OPEN_SECRET?.trim();
  if (!appId || !secret) return null;
  return { appId, secret };
}

export function wechatCallbackUrl(): string {
  const base = (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  return `${base}${CALLBACK_PATH}`;
}

/** 生成一次性 state，并返回写入浏览器的 Set-Cookie（回调时比对，防 CSRF / 登录劫持） */
export function issueOAuthState(mode: WechatOAuthMode): { state: string; cookie: string } {
  const state = crypto.randomBytes(16).toString("hex");
  const cookie = `${STATE_COOKIE}=${mode}.${state}; Path=/api/auth/wechat; HttpOnly; SameSite=Lax; Max-Age=${STATE_TTL_SECONDS}`;
  return { state, cookie };
}

export function clearOAuthStateCookie(): string {
  return `${STATE_COOKIE}=; Path=/api/auth/wechat; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** 校验回调 state 与 cookie 一致；返回发起时的模式，不一致返回 null */
export function consumeOAuthState(req: NextRequest, stateRaw: string | null): WechatOAuthMode | null {
  const cookie = req.cookies.get(STATE_COOKIE)?.value ?? "";
  const m = /^(login|bind)\.([a-f0-9]{32})$/.exec(cookie);
  if (!m || !stateRaw || !/^[a-f0-9]{32}$/.test(stateRaw)) return null;
  const ok = crypto.timingSafeEqual(Buffer.from(m[2], "hex"), Buffer.from(stateRaw, "hex"));
  return ok ? (m[1] as WechatOAuthMode) : null;
}

export function buildQrConnectUrl(appId: string, state: string): string {
  const params = new URLSearchParams({
    appid: appId,
    redirect_uri: wechatCallbackUrl(),
    response_type: "code",
    scope: "snsapi_login",
    state,
  });
  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
}

type WechatError = { errcode?: number; errmsg?: string };

async function wechatGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`微信接口 HTTP ${res.status}`);
  const json = (await res.json()) as T & WechatError;
  if (json.errcode) {
    throw new Error(`微信接口错误 ${json.errcode}：${json.errmsg ?? ""}`);
  }
  return json;
}

/** 用授权 code 换身份；code 只能用一次、5 分钟过期 */
export async function exchangeCodeForIdentity(code: string): Promise<WechatIdentity> {
  const cfg = getWechatConfig();
  if (!cfg) throw new Error("微信登录未配置");

  const tokenParams = new URLSearchParams({
    appid: cfg.appId,
    secret: cfg.secret,
    code,
    grant_type: "authorization_code",
  });
  const token = await wechatGet<{ access_token: string; openid: string; unionid?: string }>(
    `https://api.weixin.qq.com/sns/oauth2/access_token?${tokenParams.toString()}`,
  );
  if (!token.openid) throw new Error("微信未返回 openid");

  // 昵称仅用于展示；userinfo 失败不影响登录
  let nickname: string | null = null;
  let unionId = token.unionid ?? null;
  try {
    const infoParams = new URLSearchParams({
      access_token: token.access_token,
      openid: token.openid,
      lang: "zh_CN",
    });
    const info = await wechatGet<{ nickname?: string; unionid?: string }>(
      `https://api.weixin.qq.com/sns/userinfo?${infoParams.toString()}`,
    );
    nickname = info.nickname?.trim().slice(0, 64) || null;
    unionId = unionId ?? info.unionid ?? null;
  } catch (e) {
    console.warn("[wechat] userinfo failed:", e instanceof Error ? e.message : e);
  }

  return { openId: token.openid, unionId, nickname };
}
