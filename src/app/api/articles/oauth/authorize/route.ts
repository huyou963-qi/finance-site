import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/eventAuth";
import { getSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { articleResource, oauthIssuer, hashCredential, newCredential, parseScopes, registeredClient, requireSameOrigin } from "@/lib/articles/articleOAuth";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function html(body: string, status = 200, callbackOrigin?: string) {
  const csp = headers["Content-Security-Policy"].replace("form-action 'self'", `form-action 'self'${callbackOrigin ? ` ${callbackOrigin}` : ""}`);
  return new NextResponse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文章服务授权</title><style>body{font:16px/1.7 system-ui;max-width:640px;margin:40px auto;padding:20px;overflow-wrap:anywhere}button{padding:12px;margin:8px}</style><body>${body}</body></html>`, { status, headers: { ...headers, "Content-Security-Policy": csp, "Content-Type": "text/html; charset=utf-8" } });
}
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const clientId = p.get("client_id") ?? "", redirectUri = p.get("redirect_uri") ?? "";
    const client = registeredClient(clientId, redirectUri);
    const scope = parseScopes(p.get("scope") ?? "articles:read").join(" ");
    const state = p.get("state") ?? "", codeChallenge = p.get("code_challenge") ?? "";
    if (p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256" ||
        !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) || state.length > 512 || p.get("resource") !== articleResource()) {
      return html("授权参数无效。必须使用 code、S256 和文章 resource。", 400);
    }
    let admin;
    try { admin = await requireAdmin(req); } catch {
      return html('<h1>请先登录管理员账号</h1><p>在本站完成密码与 TOTP 登录后，返回 ChatGPT 重新连接文章服务。</p><a href="/">打开网站登录</a>', 401);
    }
    const nonce = newCredential();
    await prisma.weeklyOAuthConsent.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await prisma.weeklyOAuthConsent.create({ data: {
      nonceHash: hashCredential(nonce), userId: admin.id, sessionHash: hashCredential(getSessionToken(req)!),
      clientId, redirectUri, resource: articleResource(), scope, state, codeChallenge, expiresAt: new Date(Date.now() + 10 * 60_000),
    } });
    return html(`<h1>授权文章服务</h1><p>账号：${escape(admin.username)}</p><p>客户端：${escape(client.name)}</p><p>回调地址：${escape(redirectUri)}</p><p>允许的权限：${escape(scope)}</p><p>write 可创建及修改草稿；publish 可公开发布；unpublish 可撤回文章。授权有效期 30 天。</p><form method="post"><input type="hidden" name="nonce" value="${nonce}"><button name="decision" value="allow">同意授权</button><button name="decision" value="deny">拒绝</button></form>`, 200, new URL(redirectUri).origin);
  } catch { return html("授权请求无效或服务配置不完整", 400); }
}
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const admin = await requireAdmin(req);
    const form = await req.formData();
    const nonceHash = hashCredential(String(form.get("nonce") ?? ""));
    const consent = await prisma.weeklyOAuthConsent.findUnique({ where: { nonceHash } });
    if (!consent || consent.userId !== admin.id || consent.expiresAt.getTime() <= Date.now() ||
        consent.sessionHash !== hashCredential(getSessionToken(req) ?? "") || consent.resource !== articleResource()) {
      return html("授权页面已失效，请重新连接", 400);
    }
    registeredClient(consent.clientId, consent.redirectUri);
    const redirect = new URL(consent.redirectUri);
    redirect.searchParams.set("state", consent.state);
    redirect.searchParams.set("iss", oauthIssuer());
    const code = newCredential();
    const allow = form.get("decision") === "allow";
    await prisma.$transaction(async tx => {
      const removed = await tx.weeklyOAuthConsent.deleteMany({ where: { nonceHash } });
      if (removed.count !== 1) throw new Error("授权已处理");
      if (allow) await tx.weeklyOAuthGrant.create({ data: {
        userId: admin.id, clientId: consent.clientId, resource: consent.resource, scope: consent.scope,
        expiresAt: new Date(Date.now() + 30 * 86400_000), credentials: { create: {
          hash: hashCredential(code), kind: "code", redirectUri: consent.redirectUri,
          codeChallenge: consent.codeChallenge, expiresAt: new Date(Date.now() + 5 * 60_000),
        } },
      } });
    });
    redirect.searchParams.set(allow ? "code" : "error", allow ? code : "access_denied");
    return NextResponse.redirect(redirect, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch { return html("授权失败，请重新连接", 400); }
}
