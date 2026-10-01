import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIENT_ID, REDIRECT_URI, ISSUER, RESOURCE, SCOPE, AUTHORIZE_PATH, parseAuthorization, safeReturnPath, authorizationServerMetadata, protectedResourceMetadata } from "./weeklyPolicy";
import { ensureChatGptClient, validateChatGptClient } from "./weeklyClient";
import { form, sameOrigin } from "./weeklyHttp";
export const validParams = () => new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, resource: RESOURCE, scope: SCOPE, state: "opaque-state%+", code_challenge: "A".repeat(43), code_challenge_method: "S256" });
test("metadata advertises fixed resource, CIMD, public PKCE and issuer identification", () => {
  assert.equal(protectedResourceMetadata.resource, RESOURCE);
  assert.deepEqual(protectedResourceMetadata.authorization_servers, [authorizationServerMetadata.issuer]);
  assert.equal(authorizationServerMetadata.issuer, ISSUER);
  assert.equal(authorizationServerMetadata.client_id_metadata_document_supported, true);
  assert.equal(authorizationServerMetadata.authorization_response_iss_parameter_supported, true);
  assert.deepEqual(authorizationServerMetadata.token_endpoint_auth_methods_supported, ["none"]);
  assert.deepEqual(authorizationServerMetadata.code_challenge_methods_supported, ["S256"]);
});
test("strict auth input rejects duplicate, extra, missing and manipulated identifiers", () => {
  assert.equal(parseAuthorization(validParams()).state, "opaque-state%+");
  const localized = validParams(); localized.set("ui_locales", "zh-CN en-US");
  assert.equal(parseAuthorization(localized).state, "opaque-state%+");
  for (const [key, values] of Object.entries({
    client_id: ["https://attacker.invalid/client.json", CLIENT_ID + "?x=1", "https://chatgpt.com@evil.invalid/oauth/client.json"],
    redirect_uri: ["https://evil.invalid/", REDIRECT_URI + "/", REDIRECT_URI + "?next=https://evil.invalid", "//evil.invalid", "https://chatgpt.com/connector/oauth/unknown"],
    resource: [RESOURCE + "/", "https://evil.invalid"], scope: ["", SCOPE + " admin"],
    code_challenge_method: ["plain", ""], code_challenge: ["a".repeat(42), "a".repeat(44), "+".repeat(43)],
    state: ["", "x".repeat(513), "a\n", "汉字"], response_type: ["token", ""],
  })) for (const value of values) { const p = validParams(); p.set(key, value); assert.throws(() => parseAuthorization(p)); }
  for (const key of validParams().keys()) {
    const missing = validParams(); missing.delete(key); assert.throws(() => parseAuthorization(missing));
    const duplicate = validParams(); duplicate.append(key, duplicate.get(key)!); assert.throws(() => parseAuthorization(duplicate));
  }
  const extra = validParams(); extra.set("next", "https://evil.invalid"); assert.throws(() => parseAuthorization(extra));
  for (const value of ["", "zh_CN", "zh-CN\n", "x".repeat(36), "zh-CN en-US fr-FR de-DE ja-JP ko-KR"]) {
    const invalidLocale = validParams(); invalidLocale.set("ui_locales", value); assert.throws(() => parseAuthorization(invalidLocale));
  }
  const duplicateLocale = validParams(); duplicateLocale.append("ui_locales", "zh-CN"); duplicateLocale.append("ui_locales", "en-US");
  assert.throws(() => parseAuthorization(duplicateLocale));
});
test("login continuation can only return to a fully validated site OAuth path", () => {
  const good = AUTHORIZE_PATH + "?" + validParams();
  assert.equal(safeReturnPath(good), good);
  for (const bad of [null, "https://evil.invalid/", "//evil.invalid", "/auth", good + "#evil", good + "&redirect_uri=https://evil.invalid", "/api/oauth/weekly/authorize/../..?"]) assert.equal(safeReturnPath(bad), null);
});
const clientMetadata = { client_id: CLIENT_ID, redirect_uris: [REDIRECT_URI], token_endpoint_auth_methods_supported: ["none", "private_key_jwt"], token_endpoint_auth_method: "private_key_jwt" };
test("CIMD validates exact identity, redirects and negotiated none with bounded fixed fetch", async () => {
  await validateChatGptClient(async (url, init) => {
    assert.equal(url, CLIENT_ID); assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
    assert.ok(!new Headers(init?.headers).has("authorization"));
    return Response.json(clientMetadata);
  });
  for (const m of [{ ...clientMetadata, client_id: "https://evil.invalid" }, { ...clientMetadata, redirect_uris: [] }, { ...clientMetadata, token_endpoint_auth_methods_supported: ["private_key_jwt"] }, { ...clientMetadata, grant_types: ["client_credentials"] }, { ...clientMetadata, response_types: ["token"] }]) await assert.rejects(validateChatGptClient(async () => Response.json(m)));
  await assert.rejects(validateChatGptClient(async () => new Response("x".repeat(32769), { headers: { "content-type": "application/json" } })));
  await assert.rejects(validateChatGptClient(async () => new Response("{}", { status: 302 })));
});
test("pre-registered ChatGPT client is available without runtime network discovery", async () => {
  await ensureChatGptClient();
});
test("form body limits, exact content type and consent origin fail closed", async () => {
  const req = (body: string, type = "application/x-www-form-urlencoded") => new Request(ISSUER, { method: "POST", headers: { "content-type": type }, body });
  assert.equal((await form(req("a=b"))).get("a"), "b");
  await assert.rejects(form(req("x".repeat(8193))));
  await assert.rejects(form(req("a=b", "text/plain")));
  assert.equal(sameOrigin(new Request(ISSUER, { headers: { origin: ISSUER } })), true);
  assert.equal(sameOrigin(new Request(ISSUER, { headers: { origin: ISSUER, "sec-fetch-site": "none" } })), true);
  assert.equal(sameOrigin(new Request(ISSUER, { headers: { origin: ISSUER, "sec-fetch-site": "cross-site" } })), false);
  for (const origin of ["null", "https://evil.invalid", "https://gekkotech.cn.evil.invalid"]) assert.equal(sameOrigin(new Request(ISSUER, { headers: { origin } })), false);
});
