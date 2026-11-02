/** Isolated PostgreSQL test database; never migrates or writes the configured application DB. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { PrismaClient } from "@prisma/client";

async function isolatedDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) throw new Error("Billing integration requires local PostgreSQL");
  const name = `finance_zpay_test_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = new URL(url); adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  let created = false;
  const schemaDir = mkdtempSync(join(tmpdir(), "zpay-schema-"));
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
    url.pathname = `/${name}`;
    const env = { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: "test", APP_BASE_URL: "http://localhost:3000", ZPAY_PID: "123456", ZPAY_KEY: "billing-test-key-never-real", ZPAY_ENABLED: "true", ZPAY_METHODS: "alipay,wxpay" };
    // Reconstruct the pre-payment schema from the working schema, so this also works after merge.
    const added = new Set(["paymentMethod", "merchantId", "idempotencyKey", "providerTradeNo", "fulfilledAt", "lastCheckedAt", "nextCheckAt", "checkAttempts", "lastErrorCode", "events"]);
    const baseline = readFileSync("prisma/schema.prisma", "utf8").replace(/model PaymentEvent \{[\s\S]*?\n\}/, "").replace(/model PaymentOrder \{[\s\S]*?\n\}/, block => block.split("\n").filter(line => !added.has(line.trim().split(/\s+/)[0]) && !line.includes("@@unique([userId, idempotencyKey])") && !line.includes("@@index([channel, nextCheckAt])")).join("\n"));
    const schemaPath = join(schemaDir, "schema.prisma"); writeFileSync(schemaPath, baseline);
    const setup = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", "--schema", schemaPath], { env, encoding: "utf8" });
    if (setup.status !== 0) throw new Error("Could not initialize isolated billing schema");
    const testDb = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    try {
      const sql = readFileSync("prisma/migrations/20261101090000_zpay_membership/migration.sql", "utf8");
      for (const statement of sql.split(";").filter(v => v.trim())) await testDb.$executeRawUnsafe(statement);
    } finally { await testDb.$disconnect(); }
    const run = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", resolve("scripts/test/zpay.integration.ts"), "--child"], { env, stdio: "inherit" });
    if (run.status !== 0) throw new Error("Billing integration assertions failed");
  } finally {
    if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect();
    const schemaRoot = resolve(tmpdir());
    const cleanupPath = resolve(schemaDir);
    if (!cleanupPath.startsWith(schemaRoot + sep) || !basename(cleanupPath).startsWith("zpay-schema-")) throw new Error("Unsafe temporary schema cleanup path");
    rmSync(cleanupPath, { recursive: true, force: true });
  }
}

async function assertions() {
  (globalThis as typeof globalThis & { prisma?: PrismaClient }).prisma = new PrismaClient({ log: [] });
  const { prisma } = await import("../../src/lib/prisma");
  const { checkoutForUser, fulfillVerifiedOrder, reconcileOrder, reconcileDueOrders } = await import("../../src/lib/billing/zpayService");
  const { signZpay } = await import("../../src/lib/billing/zpay");
  const { activatePaidOrder, createPaymentOrder } = await import("../../src/lib/billing/orders");
  const { POST: checkout } = await import("../../src/app/api/billing/zpay/checkout/route");
  const { GET: notify } = await import("../../src/app/api/billing/zpay/notify/route");
  const { GET: getOrder, POST: checkOrder } = await import("../../src/app/api/billing/orders/[id]/route");
  const { GET: adminEvents, POST: adminRecheck } = await import("../../src/app/api/admin/orders/[id]/events/route");
  const { POST: manualCheckout } = await import("../../src/app/api/billing/orders/route");
  const { NextRequest } = await import("next/server");
  const userId = randomUUID(), otherId = randomUUID();
  const token = randomUUID(), otherToken = randomUUID();
  const trialEnd = new Date(Date.now() + 2 * 86400000);
  const user = () => prisma.user.findUniqueOrThrow({ where: { id: userId } });
  let gatewayResult: object = {};
  let networkFails = false;
  let queries = 0;
  const fetchBefore = global.fetch;
  global.fetch = async input => {
    assert.equal(new URL(String(input)).origin, "https://zpayz.cn"); queries++;
    if (networkFails) throw new Error("sensitive-url-with-key");
    return Response.json({ code: 1, ...gatewayResult });
  };
  function req(path: string, body?: object, session = token, origin = "http://localhost:3000") {
    return new NextRequest(`http://localhost:3000${path}`, { method: body ? "POST" : "GET", headers: { Cookie: `finance_sid=${session}`, Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  function evidence(order: { orderNo: string; amountCny: number; paymentMethod: string | null }, trade = randomUUID()) {
    return { out_trade_no: order.orderNo, trade_no: trade, pid: "123456", money: `${order.amountCny}.00`, type: order.paymentMethod!, status: 1 };
  }
  function notification(data: ReturnType<typeof evidence>, delta: Record<string, string> = {}) {
    const fields = { pid: data.pid, out_trade_no: data.out_trade_no, trade_no: data.trade_no, money: data.money, type: data.type, trade_status: "TRADE_SUCCESS", sign_type: "MD5", ...delta };
    return new NextRequest(`http://localhost:3000/api/billing/zpay/notify?${new URLSearchParams({ ...fields, sign: signZpay(fields, process.env.ZPAY_KEY!) })}`);
  }
  async function fresh(productType: "pro_month" | "pro_year" | "credits" = "pro_month", method: "alipay" | "wxpay" = "alipay") {
    return (await checkoutForUser(userId, { productType, method, idempotencyKey: randomUUID() })).order;
  }
  try {
    for (const id of [userId, otherId]) await prisma.user.create({ data: { id, username: `billing-${id}`, role: "user", passHash: "test-disabled", passSalt: "test", trialEndsAt: id === userId ? trialEnd : null, createdAt: new Date() } });
    for (const [id, session] of [[userId, token], [otherId, otherToken]]) await prisma.session.create({ data: { token: session, userId: id, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) } });
    assert.equal((await checkout(req("/api/billing/zpay/checkout", {}, "invalid"))).status, 401);
    const adminContext = { params: Promise.resolve({ id: "nonexistent" }) };
    assert.equal((await adminEvents(req("/api/admin/orders/nonexistent/events", undefined, "invalid"), adminContext)).status, 401);
    assert.equal((await adminRecheck(req("/api/admin/orders/nonexistent/events", {}, "invalid"), adminContext)).status, 401);
    assert.equal((await adminEvents(req("/api/admin/orders/nonexistent/events"), adminContext)).status, 403);
    assert.equal((await adminRecheck(req("/api/admin/orders/nonexistent/events", {}), adminContext)).status, 403);
    assert.equal((await manualCheckout(req("/api/billing/orders", {}, token, "https://evil.example"))).status, 403);
    assert.equal((await checkout(req("/api/billing/zpay/checkout", {}, token, "https://evil.example"))).status, 403);
    process.env.ZPAY_ENABLED = "false";
    assert.equal((await checkout(req("/api/billing/zpay/checkout", { productType: "pro_month", method: "alipay", idempotencyKey: randomUUID() }))).status, 503);
    assert.equal(await prisma.paymentOrder.count(), 0); process.env.ZPAY_ENABLED = "true";
    const idempotencyKey = randomUUID();
    const attempts = await Promise.all(Array.from({ length: 4 }, () => checkoutForUser(userId, { productType: "pro_month", method: "alipay", idempotencyKey })));
    const order = attempts[0].order;
    assert.equal(new Set(attempts.map(a => a.order.id)).size, 1);
    assert.equal(await prisma.paymentOrder.count(), 1);
    await assert.rejects(fresh(), /UNPAID_ORDER_EXISTS/);
    assert.equal((await checkoutForUser(userId, { orderId: order.id })).order.id, order.id, "existing checkout resumes explicitly");
    await assert.rejects(checkoutForUser(userId, { orderId: order.id }, "https://evil.example"), /INVALID_ORIGIN/);
    await assert.rejects(checkoutForUser(userId, { productType: "pro_year", method: "alipay", idempotencyKey }), /IDEMPOTENCY_CONFLICT/);
    const context = { params: Promise.resolve({ id: order.id }) };
    assert.equal((await getOrder(req("/x", undefined, otherToken), context)).status, 404);
    assert.equal((await checkOrder(req("/x", {}, token, "https://evil.example"), context)).status, 403);
    assert.equal((await getOrder(req("/x?trade_status=TRADE_SUCCESS"), context)).status, 200);
    assert.equal((await user()).plan, "standard", "browser return cannot grant access");
    const proof = evidence(order);
    const tampered = notification(proof); tampered.nextUrl.searchParams.set("money", "0.01");
    assert.equal((await notify(tampered)).status, 400);
    assert.equal((await notify(notification(proof, { money: "0.01" }))).status, 409);
    assert.equal((await user()).plan, "standard");
    gatewayResult = { ...proof, status: 0 };
    assert.equal((await notify(notification(proof))).status, 503, "signed callback alone is insufficient");
    assert.equal((await user()).plan, "standard");
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { lastCheckedAt: null } });
    gatewayResult = proof;
    assert.equal((await notify(notification(proof))).status, 200);
    const queryCount = queries;
    assert.equal((await notify(notification(proof))).status, 200);
    assert.equal(queries, queryCount, "settled duplicate does not query or grant again");
    assert.equal((await user()).planExpiresAt?.getTime(), trialEnd.getTime() + 30 * 86400000);
    assert.equal(await prisma.paymentEvent.count({ where: { orderId: order.id, kind: "entitlement_granted" } }), 1);
    await assert.rejects(activatePaidOrder(order.id, { id: otherId, username: "test" }, "attempt bypass"), /不能人工确认/);
    console.log("PASS: auth, ownership, CSRF, disabled channel, idempotency, tampering, gateway verification, trial preservation");

    const monthly = await fresh(); const yearly = await fresh("pro_year");
    const before = (await user()).planExpiresAt!.getTime();
    await Promise.all([fulfillVerifiedOrder(monthly.id, evidence(monthly), "test"), fulfillVerifiedOrder(yearly.id, evidence(yearly), "test")]);
    assert.equal((await user()).planExpiresAt?.getTime(), before + 395 * 86400000, "concurrent purchases cannot lose renewal days");
    const credits = await fresh("credits"); const creditProof = evidence(credits);
    await Promise.all(Array.from({ length: 6 }, () => fulfillVerifiedOrder(credits.id, creditProof, "test")));
    assert.equal((await user()).creditBalance, 10);
    assert.equal(await prisma.creditLedgerEntry.count({ where: { orderId: credits.id } }), 1);
    const laterCredits = await fresh("credits");
    await assert.rejects(fulfillVerifiedOrder(laterCredits.id, evidence(laterCredits, creditProof.trade_no), "test"));
    assert.equal((await user()).creditBalance, 10, "reused gateway transaction rolls back the credit ledger and balance");
    assert.equal(await prisma.creditLedgerEntry.count({ where: { orderId: laterCredits.id } }), 0);
    const expired = await fresh("pro_month", "wxpay");
    await prisma.paymentOrder.update({ where: { id: expired.id }, data: { status: "expired", expiresAt: new Date(Date.now() - 60000) } });
    await fulfillVerifiedOrder(expired.id, evidence(expired), "test");
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: expired.id } })).status, "paid");
    console.log("PASS: simultaneous renewals, duplicate credit callbacks, unique gateway transaction rollback, late payment");

    const suspended = await fresh(); const suspendedProof = evidence(suspended);
    await prisma.user.update({ where: { id: userId }, data: { status: "suspended" } });
    const beforeSuspended = (await user()).planExpiresAt!.getTime();
    const review = await fulfillVerifiedOrder(suspended.id, suspendedProof, "test");
    assert.equal(review.status, "review"); assert.equal(review.providerTradeNo, suspendedProof.trade_no); assert.equal(review.fulfilledAt, null);
    assert.equal((await user()).planExpiresAt!.getTime(), beforeSuspended);
    await prisma.user.update({ where: { id: userId }, data: { status: "active" } });
    await fulfillVerifiedOrder(suspended.id, suspendedProof, "test");
    assert.equal((await user()).planExpiresAt!.getTime(), beforeSuspended + 30 * 86400000);
    const mismatch = await fresh();
    gatewayResult = { ...evidence(mismatch), money: "0.01" };
    assert.equal((await reconcileOrder(mismatch.id, "user")).status, "review");
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: mismatch.id } })).lastErrorCode, "ORDER_MISMATCH");
    const timeout = await fresh("pro_year", "wxpay");
    networkFails = true;
    await reconcileOrder(timeout.id, "user");
    const failed = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: timeout.id }, include: { events: true } });
    assert.equal(failed.status, "pending"); assert.equal(failed.lastErrorCode, "GATEWAY_UNAVAILABLE");
    assert.equal(JSON.stringify(failed.events).includes("sensitive-url"), false);
    networkFails = false;
    await prisma.paymentOrder.update({ where: { id: timeout.id }, data: { lastCheckedAt: null, nextCheckAt: new Date(0) } });
    gatewayResult = evidence(timeout);
    await reconcileDueOrders(1);
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: timeout.id } })).status, "paid");
    await prisma.user.update({ where: { id: userId }, data: { plan: "pro", planExpiresAt: null } });
    await assert.rejects(fresh("pro_year"), /PERMANENT_PRO/);
    const manual = await createPaymentOrder({ userId, productType: "pro_month" });
    await activatePaidOrder(manual.id, { id: otherId, username: "fixture-admin" }, "integration evidence");
    assert.equal((await user()).planExpiresAt, null, "manual confirmation also preserves permanent membership");
    console.log("PASS: suspended-account funds tracking/recovery, mismatched evidence quarantine, timeout retry, worker recovery, permanent Pro");
  } finally { global.fetch = fetchBefore; await prisma.$disconnect(); }
}

void (process.argv.includes("--child") ? assertions() : isolatedDatabase()).catch(error => { console.error(error instanceof Error ? error.message : "Billing test failed"); process.exitCode = 1; });
