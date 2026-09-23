import { NextResponse } from "next/server";

/** 回调结束后跳回站内页面；用 APP_BASE_URL 拼绝对地址（反代后 req.url 是内网地址） */
export function wechatResultRedirect(opts: { path?: string; error?: string; status?: string }) {
  const base = (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  const url = new URL(opts.path ?? "/auth", `${base}/`);
  if (opts.error) url.searchParams.set("wechat_error", opts.error);
  if (opts.status) url.searchParams.set("wechat", opts.status);
  return NextResponse.redirect(url);
}
