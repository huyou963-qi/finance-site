import { CLIENT_ID, REDIRECT_URI, fail } from "./weeklyPolicy";

export async function validateChatGptClient(fetcher: typeof fetch = fetch) {
  // No arbitrary URL fetch, credentials, redirects or cookies: no CIMD SSRF surface.
  // The fixed ChatGPT CIMD endpoint can take several seconds from the production
  // region. Keep a bounded timeout, but leave enough headroom for normal TLS and
  // cross-region latency so legitimate authorization requests do not fail closed.
  const r = await fetcher(CLIENT_ID, { redirect: "error", cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok || !r.headers.get("content-type")?.includes("application/json") || !r.body) fail("invalid_client");
  const reader = r.body.getReader();
  let raw = "";
  let size = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) { await reader.cancel(); fail("invalid_client"); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally { reader.releaseLock(); }
  const m = JSON.parse(raw);
  const methods = m.token_endpoint_auth_methods_supported ?? [m.token_endpoint_auth_method];
  if (m.client_id !== CLIENT_ID || !Array.isArray(m.redirect_uris) || !m.redirect_uris.includes(REDIRECT_URI) ||
      !Array.isArray(methods) || !methods.includes("none") ||
      (m.grant_types && (!Array.isArray(m.grant_types) || !m.grant_types.includes("authorization_code"))) ||
      (m.response_types && (!Array.isArray(m.response_types) || !m.response_types.includes("code")))) fail("invalid_client");
}
export async function ensureChatGptClient() {
  // This private integration pre-registers ChatGPT's stable CIMD identity and
  // redirect URI in weeklyPolicy. Authorization codes are still bound to that
  // exact client, redirect, resource, scope and PKCE challenge. Do not make the
  // authorization path depend on live egress to chatgpt.com: the production
  // host cannot reliably reach that endpoint, while the code can only be sent
  // to ChatGPT's fixed HTTPS callback.
  if (CLIENT_ID !== "https://chatgpt.com/oauth/client.json" ||
      REDIRECT_URI !== "https://chatgpt.com/connector_platform_oauth_redirect") fail("invalid_client");
}
