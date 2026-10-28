import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { hashCredential } from "./oauthPolicy";

type Consent = {
  nonceHash: string; userId: string; sessionHash: string; clientId: string;
  redirectUri: string; resource: string; scope: string; state: string;
  codeChallenge: string; expiresAt: Date;
};
let savedConsent: Consent | null = null;
let grants: Record<string, unknown>[] = [];
const db = {
  user: { count: async () => 1, findUnique: async () => ({ id: "owner", username: "admin", role: "admin", status: "active", adminTotpSecret: "test-configured" }) },
  session: { findUnique: async () => ({ userId: "owner", expiresAt: new Date(Date.now() + 60_000) }) },
  weeklyOAuthConsent: {
    create: async ({ data }: { data: Consent }) => { savedConsent = data; return data; },
    findUnique: async ({ where }: { where: { nonceHash: string } }) => savedConsent?.nonceHash === where.nonceHash ? savedConsent : null,
    deleteMany: async ({ where }: { where: { nonceHash?: string } }) => {
      if (!where.nonceHash) return { count: 0 };
      if (savedConsent?.nonceHash !== where.nonceHash) return { count: 0 };
      savedConsent = null; return { count: 1 };
    },
  },
  weeklyOAuthGrant: { create: async ({ data }: { data: Record<string, unknown> }) => { grants.push(data); return data; } },
  $transaction: async (work: (tx: object) => Promise<unknown>): Promise<unknown> => work(db),
};
(globalThis as unknown as { prisma: PrismaClient }).prisma = db as unknown as PrismaClient;
const route = import("../../app/api/articles/oauth/authorize/route");
const site = "https://www.gekkotech.cn";
const callback = "https://chatgpt.com/connector_platform_oauth_redirect";

test("consent form preserves browser POST Origin and completes one-time allow/deny without weakening CSRF", async () => {
  const { GET, POST } = await route;
  const previousSite = process.env.APP_BASE_URL, previousClients = process.env.ARTICLE_OAUTH_CLIENTS;
  process.env.APP_BASE_URL = site;
  process.env.ARTICLE_OAUTH_CLIENTS = JSON.stringify([{ clientId: "chatgpt-articles", name: "ChatGPT", redirectUris: [callback] }]);
  const requestUrl = new URL(`${site}/api/articles/oauth/authorize`);
  requestUrl.search = new URLSearchParams({ client_id: "chatgpt-articles", redirect_uri: callback, response_type: "code", resource: `${site}/api/articles/mcp`, scope: "articles:read articles:write", state: "test-state", code_challenge_method: "S256", code_challenge: "A".repeat(43) }).toString();
  const headers = { Cookie: "finance_sid=test-only-session" };
  const form = async () => {
    const response = await GET(new NextRequest(requestUrl, { headers }));
    assert.equal(response.status, 200);
    // no-referrer causes real HTML form POSTs to send Origin:null, unlike fetch().
    assert.equal(response.headers.get("Referrer-Policy"), "same-origin");
    assert.match(response.headers.get("Content-Security-Policy") ?? "", /form-action 'self' https:\/\/chatgpt.com/);
    const nonce = /name="nonce" value="([A-Za-z0-9_-]+)"/.exec(await response.text())?.[1];
    assert.ok(nonce);
    return nonce;
  };
  const submit = (nonce: string, origin: string, decision = "allow") => POST(new NextRequest(requestUrl, {
    method: "POST", headers: { ...headers, Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ nonce, decision }),
  }));
  try {
    savedConsent = null; grants = [];
    const nonce = await form();
    assert.equal((await submit(nonce, "null")).status, 400);
    assert.equal((await submit(nonce, "https://evil.example")).status, 400);
    assert.equal(grants.length, 0);
    const allowed = await submit(nonce, site);
    assert.equal(allowed.status, 303);
    const redirect = new URL(allowed.headers.get("Location")!);
    assert.equal(`${redirect.origin}${redirect.pathname}`, callback);
    assert.equal(redirect.searchParams.get("state"), "test-state");
    assert.equal(redirect.searchParams.get("iss"), `${site}/api/articles/oauth`);
    assert.equal(grants.length, 1);
    const credentials = grants[0].credentials as { create: { hash: string } };
    assert.equal(credentials.create.hash, hashCredential(redirect.searchParams.get("code")!));
    // Callback navigation keeps referrer suppression; no code goes in Referer.
    assert.equal(allowed.headers.get("Referrer-Policy"), "no-referrer");
    assert.equal((await submit(nonce, site)).status, 400);
    assert.equal(grants.length, 1);
    const denied = await submit(await form(), site, "deny");
    assert.equal(denied.status, 303);
    assert.equal(new URL(denied.headers.get("Location")!).searchParams.get("error"), "access_denied");
    assert.equal(grants.length, 1);
  } finally {
    if (previousSite === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = previousSite;
    if (previousClients === undefined) delete process.env.ARTICLE_OAUTH_CLIENTS; else process.env.ARTICLE_OAUTH_CLIENTS = previousClients;
  }
});
