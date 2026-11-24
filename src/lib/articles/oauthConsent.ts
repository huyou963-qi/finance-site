import { NextRequest, NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashCredential, newCredential, requireSameOrigin } from "@/lib/articles/articleOAuth";

// HTML form POSTs under no-referrer send Origin:null and fail our CSRF check.
// Keep the same-origin Origin intact; external callback redirects still use no-referrer.
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "same-origin", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
type ConsentPolicy = {
  resource: () => string;
  issuer: () => string;
  client: (id: string, redirectUri: string) => { name: string };
  scope: (raw: string | null) => string;
  user: (req: NextRequest) => Promise<{ id: string; username: string }>;
  title: string;
  description: string;
  denied: (error: unknown) => { body: string; status: number };
  links?: string;
  optionalScopes?: readonly { scope: string; label: string }[];
};
export function createConsentHandlers(policy: ConsentPolicy) {
  function html(body: string, status = 200, callbackOrigin?: string) {
    const csp = headers["Content-Security-Policy"].replace("form-action 'self'", `form-action 'self'${callbackOrigin ? ` ${callbackOrigin}` : ""}`);
    return new NextResponse(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${policy.title}</title><style>body{font:16px/1.7 system-ui;max-width:640px;margin:40px auto;padding:20px;overflow-wrap:anywhere}button{padding:12px;margin:8px}</style><body>${body}</body></html>`, { status, headers: { ...headers, "Content-Security-Policy": csp, "Content-Type": "text/html; charset=utf-8" } });
  }
  async function GET(req: NextRequest) {
    try {
      const p = req.nextUrl.searchParams;
      const clientId = p.get("client_id") ?? "", redirectUri = p.get("redirect_uri") ?? "";
      const client = policy.client(clientId, redirectUri);
      const scope = policy.scope(p.get("scope"));
      const state = p.get("state") ?? "", codeChallenge = p.get("code_challenge") ?? "";
      if (p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256" ||
          !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) || state.length > 512 || p.get("resource") !== policy.resource()) {
        return html("授权参数无效。必须使用 code、S256 和正确的 resource。", 400);
      }
      let user;
      try { user = await policy.user(req); } catch (error) {
        const denied = policy.denied(error);
        return html(denied.body, denied.status);
      }
      const nonce = newCredential();
      await prisma.weeklyOAuthConsent.deleteMany({ where: { expiresAt: { lte: new Date() } } });
      await prisma.weeklyOAuthConsent.create({ data: {
        nonceHash: hashCredential(nonce), userId: user.id, sessionHash: hashCredential(getSessionToken(req)!),
        clientId, redirectUri, resource: policy.resource(), scope, state, codeChallenge, expiresAt: new Date(Date.now() + 10 * 60_000),
      } });
      const options = policy.optionalScopes?.filter(option => scope.split(" ").includes(option.scope)) ?? [];
      const choices = options.length ? `<fieldset><legend>可选的个人数据权限</legend>${options.map(option =>
        `<label><input type="checkbox" name="include_scope" value="${escape(option.scope)}"> ${escape(option.label)}</label><br>`
      ).join("")}</fieldset>` : "";
      return html(`<h1>${policy.title}</h1><p>账号：${escape(user.username)}</p><p>客户端：${escape(client.name)}</p><p>回调地址：${escape(redirectUri)}</p><p>请求权限：${escape(scope)}</p><p>${escape(policy.description)} 授权有效期 30 天。</p><form method="post"><input type="hidden" name="nonce" value="${nonce}">${choices}<button name="decision" value="allow">同意授权</button><button name="decision" value="deny">拒绝</button></form>${policy.links ?? ""}`, 200, new URL(redirectUri).origin);
    } catch { return html("授权请求无效或服务配置不完整", 400); }
  }
  async function POST(req: NextRequest) {
    try {
      requireSameOrigin(req);
      const user = await policy.user(req);
      const form = await req.formData();
      const nonceHash = hashCredential(String(form.get("nonce") ?? ""));
      const consent = await prisma.weeklyOAuthConsent.findUnique({ where: { nonceHash } });
      if (!consent || consent.userId !== user.id || consent.expiresAt.getTime() <= Date.now() ||
          consent.sessionHash !== hashCredential(getSessionToken(req) ?? "") || consent.resource !== policy.resource()) {
        return html("授权页面已失效，请重新连接", 400);
      }
      policy.client(consent.clientId, consent.redirectUri);
      const redirect = new URL(consent.redirectUri);
      redirect.searchParams.set("state", consent.state);
      redirect.searchParams.set("iss", policy.issuer());
      const code = newCredential();
      const allow = form.get("decision") === "allow";
      const optional = new Set(policy.optionalScopes?.map(option => option.scope) ?? []);
      const selected = new Set(form.getAll("include_scope"));
      const grantedScope = consent.scope.split(" ").filter(scope => !optional.has(scope) || selected.has(scope)).join(" ");
      await prisma.$transaction(async tx => {
        const removed = await tx.weeklyOAuthConsent.deleteMany({ where: { nonceHash } });
        if (removed.count !== 1) throw new Error("授权已处理");
        if (allow) await tx.weeklyOAuthGrant.create({ data: {
          userId: user.id, clientId: consent.clientId, resource: consent.resource, scope: grantedScope,
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
  return { GET, POST };
}
