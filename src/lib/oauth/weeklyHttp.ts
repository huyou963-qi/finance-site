import { CONSENT_COOKIE, OAuthError } from "./weeklyPolicy";
export function cookie(req: Request, name: string) {
  const parts = (req.headers.get("cookie") ?? "").split(";").map(x => x.trim()).filter(x => x.startsWith(name + "="));
  if (parts.length !== 1) return null;
  try { return decodeURIComponent(parts[0].slice(name.length + 1)); } catch { return null; }
}
export function setCookie(name: string, value: string, maxAge = 600) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
export function oauthError(e: unknown) {
  return json({
    error: e instanceof OAuthError ? e.error : "server_error",
    ...(e instanceof OAuthError && e.description ? { error_description: e.description } : {}),
  }, e instanceof OAuthError ? e.status : 503);
}
export function redirect(location: string, clearConsent = false) {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...(clearConsent ? { "Set-Cookie": setCookie(CONSENT_COOKIE, "", 0) } : {}) } });
}
export async function form(req: Request, maxBytes = 8192) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) throw new OAuthError("invalid_request");
  if (!req.body) throw new OAuthError("invalid_request");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new OAuthError("invalid_request", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
}
