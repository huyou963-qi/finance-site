import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { weeklyStore, hash, pkce, randomCredential } from "./weeklyStore";
import { CLIENT_ID, REDIRECT_URI, RESOURCE, SCOPE } from "./weeklyPolicy";
import { authorize, token, revoke, resume } from "./weeklyRoutes";
import { CONSENT_COOKIE, RETURN_COOKIE, ISSUER, AUTHORIZE_PATH } from "./weeklyPolicy";
const dbUrl = process.env.OAUTH_TEST_DATABASE_URL;
test("PostgreSQL migration and OAuth lifecycle: atomic exchange, replay, rotation, expiry, revocation, admin and session binding", { skip: !dbUrl }, async t => {
  const db = new PrismaClient({ datasources: { db: { url: dbUrl } }, log: [] });
  const store = weeklyStore(db);
  const userId = "oauth-test-" + randomUUID();
  const session = randomCredential();
  const verifier = randomCredential();
  const input = { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, resource: RESOURCE, scope: SCOPE, state: "state%+", codeChallenge: pkce(verifier) };
  await db.user.create({ data: { id: userId, username: userId, role: "admin", passHash: "fixture", passSalt: "fixture", createdAt: new Date() } });
  await db.session.create({ data: { token: session, userId, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) } });
  const issue = async () => {
    const nonce = await store.createConsent(input, userId, hash(session));
    const approved = await store.approve(nonce, userId, hash(session), true);
    assert.ok(approved.code);
    return approved.code;
  };
  const exchange = (code: string, extra = {}) => store.exchange({ kind: "code", credential: code, clientId: CLIENT_ID, resource: RESOURCE, redirectUri: REDIRECT_URI, verifier, ...extra });
  const refresh = (r: string, extra = {}) => store.exchange({ kind: "refresh", credential: r, clientId: CLIENT_ID, resource: RESOURCE, ...extra });
  try {
    await t.test("admin consent/session expiration and approval are bound and single-use", async () => {
      assert.equal((await store.adminSession(session))?.role, "admin");
      assert.equal(await store.adminSession("absent"), null);
      const nonce = await store.createConsent(input, userId, hash(session));
      await assert.rejects(store.approve(nonce, userId, hash("another-session"), true));
      await assert.rejects(store.approve(nonce, "wrong-user", hash(session), true));
      const denied = await store.approve(nonce, userId, hash(session), false);
      assert.equal(denied.code, null);
      await assert.rejects(store.approve(nonce, userId, hash(session), true));
      const cookieElided = await store.createConsent(input, userId, hash(session));
      assert.equal((await store.approve(cookieElided, null, null, false)).code, null);
      const expired = await store.createConsent(input, userId, hash(session));
      await db.weeklyOAuthConsent.update({ where: { nonceHash: hash(expired) }, data: { expiresAt: new Date(0) } });
      await assert.rejects(store.approve(expired, userId, hash(session), true));
      const inactiveSession = await store.createConsent(input, userId, hash(session));
      await db.session.update({ where: { token: session }, data: { expiresAt: new Date(0) } });
      assert.equal(await store.adminSession(session), null);
      await assert.rejects(store.approve(inactiveSession, null, null, true));
      await db.session.update({ where: { token: session }, data: { expiresAt: new Date(Date.now() + 3600_000) } });
    });
    await t.test("PKCE/binding mismatch cannot consume code; only digests persisted", async () => {
      const code = await issue();
      for (const extra of [{ verifier: randomCredential() }, { redirectUri: REDIRECT_URI + "/" }, { clientId: "other" }, { resource: RESOURCE + "/" }]) await assert.rejects(exchange(code, extra));
      const receipt = await exchange(code);
      assert.equal(await store.authenticate("Bearer " + receipt.access_token), true);
      assert.equal(await store.authenticate("Bearer " + code), false);
      assert.equal(await store.authenticate("Bearer " + receipt.refresh_token), false);
      const rows = await db.weeklyOAuthCredential.findMany();
      for (const row of rows) { assert.match(row.hash, /^[a-f0-9]{64}$/); assert.ok(![code, receipt.access_token, receipt.refresh_token].includes(row.hash)); }
      await assert.rejects(exchange(code));
      assert.equal(await store.authenticate("Bearer " + receipt.access_token), false);
    });
    await t.test("simultaneous exchanges cannot both issue; replay revokes the family", async () => {
      const code = await issue();
      const attempts = await Promise.allSettled([exchange(code), exchange(code)]);
      assert.equal(attempts.filter(x => x.status === "fulfilled").length, 1);
      const winner = attempts.find(x => x.status === "fulfilled");
      if (winner?.status === "fulfilled") assert.equal(await store.authenticate("Bearer " + winner.value.access_token), false);
    });
    await t.test("refresh rotates, cannot escalate and old refresh replay revokes all", async () => {
      const a = await exchange(await issue());
      await assert.rejects(refresh(a.refresh_token, { scope: SCOPE + " admin" }));
      const b = await refresh(a.refresh_token);
      assert.notEqual(a.refresh_token, b.refresh_token);
      assert.equal(await store.authenticate("Bearer " + b.access_token), true);
      await assert.rejects(refresh(a.refresh_token));
      assert.equal(await store.authenticate("Bearer " + b.access_token), false);
      await assert.rejects(refresh(b.refresh_token));
    });
    await t.test("expiry, administrator demotion and RFC7009 family revocation reject access", async () => {
      const a = await exchange(await issue());
      await db.weeklyOAuthCredential.update({ where: { hash: hash(a.access_token) }, data: { expiresAt: new Date(0) } });
      assert.equal(await store.authenticate("Bearer " + a.access_token), false);
      await db.user.update({ where: { id: userId }, data: { role: "user" } });
      await assert.rejects(refresh(a.refresh_token));
      await db.user.update({ where: { id: userId }, data: { role: "admin" } });
      const b = await refresh(a.refresh_token);
      await store.revoke(b.access_token, CLIENT_ID);
      assert.equal(await store.authenticate("Bearer " + b.access_token), false);
      await assert.rejects(refresh(b.refresh_token));
      await store.revoke("unknown", CLIENT_ID);
      const c = await issue();
      await db.weeklyOAuthCredential.update({ where: { hash: hash(c) }, data: { expiresAt: new Date(0) } });
      await assert.rejects(exchange(c));
      const d = await exchange(await issue());
      await db.weeklyOAuthCredential.update({ where: { hash: hash(d.refresh_token) }, data: { expiresAt: new Date(0) } });
      await assert.rejects(refresh(d.refresh_token));
      const e = await exchange(await issue());
      const cred = await db.weeklyOAuthCredential.findUniqueOrThrow({ where: { hash: hash(e.access_token) } });
      await db.weeklyOAuthGrant.update({ where: { id: cred.grantId }, data: { expiresAt: new Date(0) } });
      assert.equal(await store.authenticate("Bearer " + e.access_token), false);
    });
    await t.test("HTTP authorization rejects CSRF and nonadmins, resumes login, exchanges token and revokes", async () => {
      const d = { store, validateClient: async () => {} };
      const params = new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, resource: RESOURCE, scope: SCOPE, state: input.state, code_challenge: pkce(verifier), code_challenge_method: "S256" });
      const authUrl = ISSUER + AUTHORIZE_PATH + "?" + params;
      const anonymous = await authorize(new Request(authUrl), d);
      assert.equal(anonymous.status, 303); assert.equal(anonymous.headers.get("location"), ISSUER + "/auth?weekly_oauth=1");
      const resumeCookie = anonymous.headers.get("set-cookie")!.split(";")[0];
      assert.equal(resume(new Request(ISSUER, { headers: { cookie: resumeCookie } })).headers.get("location"), authUrl);
      assert.equal(resume(new Request(ISSUER, { headers: { cookie: RETURN_COOKIE + "=" + encodeURIComponent("//evil.invalid") } })).headers.get("location"), ISSUER + "/");
      await db.user.update({ where: { id: userId }, data: { role: "user" } });
      assert.equal((await authorize(new Request(authUrl, { headers: { cookie: "finance_sid=" + session } }), d)).status, 403);
      await db.user.update({ where: { id: userId }, data: { role: "admin" } });
      const page = await authorize(new Request(authUrl, { headers: { cookie: "finance_sid=" + session } }), d);
      assert.equal(page.status, 200); assert.ok(page.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
      const html = await page.text(); const nonce = /name="nonce" value="([A-Za-z0-9_-]{43})"/.exec(html)![1];
      const post = (body: string, cs = nonce, headers = {}) => new Request(ISSUER + AUTHORIZE_PATH, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: `finance_sid=${session}; ${CONSENT_COOKIE}=${cs}`, ...headers }, body });
      assert.equal((await authorize(post(`nonce=${nonce}&decision=approve`, "wrong"), d)).status, 400);
      assert.equal((await authorize(post(`nonce=${nonce}&decision=approve&redirect_uri=https://evil.invalid`), d)).status, 400);
      // ChatGPT's top-level OAuth navigation can legitimately preserve a
      // cross-site initiator and omit SameSite=Lax cookies. The one-time nonce
      // plus the still-active originating admin session remain the CSRF boundary.
      const approved = await authorize(new Request(ISSUER + AUTHORIZE_PATH, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://chatgpt.com", "sec-fetch-site": "cross-site" }, body: `nonce=${nonce}&decision=approve` }), d);
      const cb = new URL(approved.headers.get("location")!);
      assert.equal(cb.origin + cb.pathname, REDIRECT_URI); assert.equal(cb.searchParams.get("state"), input.state); assert.equal(cb.searchParams.get("iss"), ISSUER);
      const tokenBody = new URLSearchParams({ grant_type: "authorization_code", client_id: CLIENT_ID, resource: RESOURCE, redirect_uri: REDIRECT_URI, code: cb.searchParams.get("code")!, code_verifier: verifier });
      const tr = await token(new Request(ISSUER, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: tokenBody }), d);
      assert.equal(tr.status, 200); const tokens = await tr.json(); assert.equal(tokens.scope, SCOPE);
      const rr = await revoke(new Request(ISSUER, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: CLIENT_ID, token: tokens.refresh_token }) }), d);
      assert.equal(rr.status, 200); assert.equal(await store.authenticate("Bearer " + tokens.access_token), false);
    });
  } finally {
    await db.weeklyOAuthConsent.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }
});
