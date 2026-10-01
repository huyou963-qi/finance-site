// Public, fixed identifiers. Safe to import in the login UI.
export const ISSUER = "https://gekkotech.cn";
export const RESOURCE = ISSUER + "/api/weekly-reports/mcp";
export const SCOPE = "weekly-report:write";
export const CLIENT_ID = "https://chatgpt.com/oauth/client.json";
export const REDIRECT_URI = "https://chatgpt.com/connector_platform_oauth_redirect";
export const AUTHORIZE_PATH = "/api/oauth/weekly/authorize";
export const METADATA_URL = ISSUER + "/.well-known/oauth-protected-resource/api/weekly-reports/mcp";
export const RETURN_COOKIE = "__Host-weekly-oauth-return";
export const CONSENT_COOKIE = "__Host-weekly-oauth-consent";
export const securitySchemes = [{ type: "oauth2", scopes: [SCOPE] }];
export const challenge = `Bearer resource_metadata="${METADATA_URL}", scope="${SCOPE}"`;
export const protectedResourceMetadata = {
  resource: RESOURCE, authorization_servers: [ISSUER], scopes_supported: [SCOPE],
  bearer_methods_supported: ["header"], resource_name: "GekkoTech Weekly Market Publisher",
};
export const authorizationServerMetadata = {
  issuer: ISSUER, authorization_endpoint: ISSUER + AUTHORIZE_PATH,
  token_endpoint: ISSUER + "/api/oauth/weekly/token",
  revocation_endpoint: ISSUER + "/api/oauth/weekly/revoke",
  response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["none"], revocation_endpoint_auth_methods_supported: ["none"],
  code_challenge_methods_supported: ["S256"], scopes_supported: [SCOPE],
  client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true,
};
export type AuthorizationInput = {
  clientId: string; redirectUri: string; resource: string; scope: string; state: string; codeChallenge: string;
};
export class OAuthError extends Error {
  constructor(public readonly error: string, public readonly status = 400, public readonly description?: string) { super(error); }
}
export function fail(error = "invalid_request"): never { throw new OAuthError(error); }
export function uniqueParams(p: URLSearchParams, allowed: string[]) {
  for (const key of p.keys()) if (!allowed.includes(key) || p.getAll(key).length !== 1) fail();
}
export function parseAuthorization(p: URLSearchParams): AuthorizationInput {
  uniqueParams(p, ["response_type", "client_id", "redirect_uri", "resource", "scope", "state", "code_challenge", "code_challenge_method", "ui_locales"]);
  if (p.get("response_type") !== "code" || p.get("client_id") !== CLIENT_ID ||
      p.get("redirect_uri") !== REDIRECT_URI || p.get("resource") !== RESOURCE ||
      p.get("scope") !== SCOPE || p.get("code_challenge_method") !== "S256") fail();
  const state = p.get("state") ?? "";
  const codeChallenge = p.get("code_challenge") ?? "";
  const uiLocales = p.get("ui_locales");
  // Opaque state is echoed byte-for-byte; printable ASCII only, bounded and nonempty.
  if (!/^[\x21-\x7e]{1,512}$/.test(state) || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(codeChallenge)) fail();
  // RFC 5646 language tags supplied by ChatGPT are display hints only. Accept a
  // short, space-separated list while rejecting control characters and abuse.
  if (uiLocales !== null && !/^[A-Za-z0-9-]{1,35}(?: [A-Za-z0-9-]{1,35}){0,4}$/.test(uiLocales)) fail();
  return { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, resource: RESOURCE, scope: SCOPE, state, codeChallenge };
}
export function safeReturnPath(value: string | null): string | null {
  if (!value || value.length > 4096 || !value.startsWith(AUTHORIZE_PATH + "?")) return null;
  try {
    const url = new URL(value, ISSUER);
    if (url.origin !== ISSUER || url.pathname !== AUTHORIZE_PATH || url.hash || url.username || url.password) return null;
    parseAuthorization(url.searchParams);
    return url.pathname + url.search;
  } catch { return null; }
}
