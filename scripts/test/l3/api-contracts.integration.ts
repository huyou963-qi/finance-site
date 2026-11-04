/**
 * L3: minimal API contract checks against an isolated migrated database.
 * Imports Route Handlers directly (same pattern as billing integration).
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createIsolatedDatabase, runPrismaMigrateDeploy } from "./isolatedDb";

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function assertNoLeak(body: string): void {
  const match = body.match(/passHash|passSalt|adminTotpSecret|BEGIN (RSA )?PRIVATE|DATABASE_URL|"stack"|at Object\./i);
  assert.equal(match, null, `response leaked sensitive content: ${match?.[0] ?? ""}`);
}

async function withMigratedDb<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const isolated = await createIsolatedDatabase("finance_l3_api");
  try {
    runPrismaMigrateDeploy(isolated.url);
    process.env.DATABASE_URL = isolated.url;
    process.env.APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
    process.env.NODE_ENV = "test";
    return await fn(isolated.url);
  } finally {
    await isolated.drop();
  }
}

async function seedUsers(url: string): Promise<{ freeToken: string; adminToken: string }> {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const freeId = randomUUID();
  const adminId = randomUUID();
  const freeToken = randomUUID();
  const adminToken = randomUUID();
  const salt = randomBytes(16).toString("hex");
  try {
    await db.user.create({
      data: {
        id: freeId,
        username: "l3-free-user",
        email: "l3-free@example.com",
        emailVerifiedAt: new Date(),
        passHash: hashPassword("L3FreePass1!", salt),
        passSalt: salt,
        role: "user",
        plan: "standard",
        createdAt: new Date(),
      },
    });
    await db.user.create({
      data: {
        id: adminId,
        username: "l3-admin-user",
        email: "l3-admin@example.com",
        emailVerifiedAt: new Date(),
        passHash: hashPassword("L3AdminPass1!", salt),
        passSalt: salt,
        role: "admin",
        // Staff sessions require a bound TOTP secret; value is not decrypted on read paths.
        adminTotpSecret: "l3-test-totp-placeholder",
        plan: "pro",
        createdAt: new Date(),
      },
    });
    const expiresAt = new Date(Date.now() + 3600_000);
    await db.session.create({
      data: { token: freeToken, userId: freeId, createdAt: new Date(), expiresAt },
    });
    await db.session.create({
      data: { token: adminToken, userId: adminId, createdAt: new Date(), expiresAt },
    });
    await db.systemMacroChartPrefs.upsert({
      where: { id: "default" },
      create: { id: "default", prefs: { version: 1, templates: [] } },
      update: {},
    });
  } finally {
    await db.$disconnect();
  }
  return { freeToken, adminToken };
}

async function assertions(url: string): Promise<void> {
  // Point the shared prisma singleton at the isolated DB before importing routes.
  const { PrismaClient: PC } = await import("@prisma/client");
  (globalThis as typeof globalThis & { prisma?: InstanceType<typeof PC> }).prisma = new PC({
    datasources: { db: { url } },
    log: [],
  });

  const { freeToken, adminToken } = await seedUsers(url);
  const { NextRequest } = await import("next/server");
  const { GET: health } = await import("../../../src/app/api/health/route");
  const { GET: me } = await import("../../../src/app/api/auth/me/route");
  const { GET: adminFeatureAccess } = await import("../../../src/app/api/admin/feature-access/route");
  const { GET: macroPrefs, PUT: putMacroPrefs } = await import(
    "../../../src/app/api/tools/macro-chart-prefs/route"
  );
  const { GET: klines } = await import("../../../src/app/api/data/klines/route");

  function req(path: string, init?: { method?: string; body?: unknown; session?: string }) {
    const headers: Record<string, string> = {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
    };
    if (init?.session) headers.Cookie = `finance_sid=${init.session}`;
    return new NextRequest(`http://localhost:3000${path}`, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers,
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    });
  }

  const healthRes = await health();
  assert.equal(healthRes.status, 200);
  const healthBody = (await healthRes.json()) as { ok: boolean; db: boolean; ts: string };
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.db, true);
  assert.ok(typeof healthBody.ts === "string" && healthBody.ts.length > 0);
  assertNoLeak(JSON.stringify(healthBody));

  const anonMe = await me(req("/api/auth/me"));
  assert.equal(anonMe.status, 401);
  const anonBody = (await anonMe.json()) as { user: null };
  assert.equal(anonBody.user, null);
  assertNoLeak(JSON.stringify(anonBody));

  const freeMe = await me(req("/api/auth/me", { session: freeToken }));
  assert.equal(freeMe.status, 200);
  const freeBody = (await freeMe.json()) as { user: { username: string; role: string } };
  assert.equal(freeBody.user.username, "l3-free-user");
  assert.equal(freeBody.user.role, "user");
  assertNoLeak(JSON.stringify(freeBody));

  assert.equal((await adminFeatureAccess(req("/api/admin/feature-access"))).status, 401);
  assert.equal(
    (await adminFeatureAccess(req("/api/admin/feature-access", { session: freeToken }))).status,
    403,
  );
  const adminOk = await adminFeatureAccess(req("/api/admin/feature-access", { session: adminToken }));
  assert.equal(adminOk.status, 200);
  const adminPayload = (await adminOk.json()) as { features: unknown[]; policy: unknown };
  assert.ok(Array.isArray(adminPayload.features));
  assert.ok(adminPayload.policy && typeof adminPayload.policy === "object");
  assertNoLeak(JSON.stringify(adminPayload));

  const prefsGet = await macroPrefs(req("/api/tools/macro-chart-prefs"));
  assert.equal(prefsGet.status, 200);
  const prefsBody = (await prefsGet.json()) as { prefs: null; user: null };
  assert.equal(prefsBody.prefs, null);
  assert.equal(prefsBody.user, null);

  const prefsPutAnon = await putMacroPrefs(
    req("/api/tools/macro-chart-prefs", { method: "PUT", body: { prefs: { version: 1 } } }),
  );
  assert.equal(prefsPutAnon.status, 401);

  const prefsPutFree = await putMacroPrefs(
    req("/api/tools/macro-chart-prefs", {
      method: "PUT",
      session: freeToken,
      body: { prefs: { layoutMode: 1, selectedKeys: ["fred:CPIAUCSL"] } },
    }),
  );
  assert.equal(prefsPutFree.status, 200);

  const prefsPutSystemAsFree = await putMacroPrefs(
    req("/api/tools/macro-chart-prefs", {
      method: "PUT",
      session: freeToken,
      body: { systemMacroChartPrefs: { version: 1, builtinTemplateOverrides: {} } },
    }),
  );
  assert.equal(prefsPutSystemAsFree.status, 403);

  assert.equal(
    (await klines(req("/api/data/klines?fromSec=100&symbol=AAPL"))).status,
    400,
  );
  assert.equal(
    (await klines(req("/api/data/klines?before=1&fromSec=1&toSec=2&symbol=AAPL"))).status,
    400,
  );
  assert.equal((await klines(req("/api/data/klines?source=nope&symbol=AAPL"))).status, 400);
  const badSource = await klines(req("/api/data/klines?source=nope&symbol=AAPL"));
  const badSourceBody = await badSource.text();
  assertNoLeak(badSourceBody);

  console.log("PASS: health, auth/me, admin feature-access, macro-chart-prefs, klines validation");
}

async function main(): Promise<void> {
  await withMigratedDb(assertions);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
