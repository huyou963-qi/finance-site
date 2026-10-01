import { AUTHORIZE_PATH, CLIENT_ID, CONSENT_COOKIE, ISSUER, REDIRECT_URI, RESOURCE, RETURN_COOKIE, SCOPE, OAuthError, parseAuthorization, safeReturnPath, uniqueParams, fail } from "./weeklyPolicy";
import { cookie, form, json, oauthError, redirect, sameOrigin, setCookie } from "./weeklyHttp";
import { ensureChatGptClient } from "./weeklyClient";
import { weeklyStore } from "./weeklyStore";

type Dependencies = { store: ReturnType<typeof weeklyStore>; validateClient: () => Promise<void> };
const deps: Dependencies = { store: weeklyStore(), validateClient: ensureChatGptClient };
export async function authorize(req: Request, d: Dependencies = deps) {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      if (url.search.length > 4096) fail();
      const input = parseAuthorization(url.searchParams);
      await d.validateClient();
      const session = await d.store.adminSession(cookie(req, "finance_sid"));
      if (!session) {
        const r = redirect(ISSUER + "/auth?weekly_oauth=1");
        r.headers.append("Set-Cookie", setCookie(RETURN_COOKIE, AUTHORIZE_PATH + url.search));
        return r;
      }
      if (session.role !== "admin") throw new OAuthError("access_denied", 403);
      const nonce = await d.store.createConsent(input, session.id, session.sessionHash);
      // Only a generated base64url nonce is interpolated; query/state never enter HTML.
      return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>授权周报发布</title><body><main><h1>允许 ChatGPT 发布 GekkoTech 周报？</h1><p>客户端：ChatGPT（chatgpt.com）</p><p>权限：weekly-report:write。可按周末日期创建或更新完整周报。</p><p>访问令牌有效 1 小时；自动续期授权最长 1 年，90 天未续期失效。可随时撤销。</p><form method="post" action="${AUTHORIZE_PATH}"><input type="hidden" name="nonce" value="${nonce}"><button name="decision" value="approve">批准发布</button> <button name="decision" value="deny">拒绝</button></form></main></body></html>`, {
        headers: {
          "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
          "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
          "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff",
          "Set-Cookie": setCookie(CONSENT_COOKIE, nonce),
        },
      });
    }
    if (req.method !== "POST") throw new OAuthError("invalid_request", 405);
    if (!sameOrigin(req)) throw new OAuthError("access_denied", 403, "consent_origin");
    const p = await form(req);
    uniqueParams(p, ["nonce", "decision"]);
    const nonce = p.get("nonce");
    if (!nonce || nonce !== cookie(req, CONSENT_COOKIE) || !["approve", "deny"].includes(p.get("decision") ?? "")) fail();
    const session = await d.store.adminSession(cookie(req, "finance_sid"));
    if (!session || session.role !== "admin") throw new OAuthError("access_denied", 403, "admin_session");
    await d.validateClient();
    const { consent, code } = await d.store.approve(nonce, session.id, session.sessionHash, p.get("decision") === "approve");
    // Defense in depth against corrupted stored destinations.
    if (consent.clientId !== CLIENT_ID || consent.redirectUri !== REDIRECT_URI || consent.resource !== RESOURCE || consent.scope !== SCOPE) fail();
    const callback = new URL(REDIRECT_URI);
    callback.searchParams.set("iss", ISSUER);
    callback.searchParams.set("state", consent.state);
    callback.searchParams.set(code ? "code" : "error", code ?? "access_denied");
    return redirect(callback.href, true);
  } catch (e) { return oauthError(e); }
}
export async function token(req: Request, d: Dependencies = deps) {
  try {
    if (req.headers.has("authorization")) fail("invalid_client");
    const p = await form(req);
    const kind = p.get("grant_type") === "authorization_code" ? "code" : p.get("grant_type") === "refresh_token" ? "refresh" : fail("unsupported_grant_type");
    uniqueParams(p, kind === "code" ? ["grant_type", "client_id", "resource", "code", "code_verifier", "redirect_uri"] : ["grant_type", "client_id", "resource", "refresh_token", "scope"]);
    if (p.get("client_id") !== CLIENT_ID || p.get("resource") !== RESOURCE) fail("invalid_grant");
    await d.validateClient();
    return json(await d.store.exchange({ kind, credential: p.get(kind === "code" ? "code" : "refresh_token") ?? "", clientId: CLIENT_ID, resource: RESOURCE,
      ...(kind === "code" ? { redirectUri: p.get("redirect_uri") ?? "", verifier: p.get("code_verifier") ?? "" } : {}),
      ...(p.has("scope") ? { scope: p.get("scope")! } : {}),
    }));
  } catch (e) { return oauthError(e); }
}
export async function revoke(req: Request, d: Dependencies = deps) {
  try {
    if (req.headers.has("authorization")) fail("invalid_client");
    const p = await form(req);
    uniqueParams(p, ["token", "client_id", "token_type_hint"]);
    if (!p.has("token") || p.get("client_id") !== CLIENT_ID) fail("invalid_client");
    await d.store.revoke(p.get("token")!, CLIENT_ID);
    return json({});
  } catch (e) { return oauthError(e); }
}
export function resume(req: Request) {
  const path = safeReturnPath(cookie(req, RETURN_COOKIE));
  const r = redirect(ISSUER + (path ?? "/"));
  r.headers.append("Set-Cookie", setCookie(RETURN_COOKIE, "", 0));
  return r;
}
