/** Isolated PostgreSQL required. Never run against a shared or production database. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { getUserByRequest } from "../../src/lib/auth";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { useLocalCompanyEvents } from "../../src/lib/equity/useLocalCompanyEvents";
import type { selectChartEvents } from "../../src/lib/chart/eventSelection";
import { prisma } from "../../src/lib/prisma";
import { GET, POST } from "../../src/app/api/user/event-packs/route";
import { POST as issue, DELETE as revoke } from "../../src/app/api/user/event-packs/credential/route";
declare global { interface Window { e2eStore: ReturnType<typeof useLocalCompanyEvents>; e2eSelection: ReturnType<typeof selectChartEvents>; } }
const url = new URL(process.env.DATABASE_URL || "http://missing");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.includes("event_test")) throw new Error("Use only the isolated localhost event_test database");
const ids = [randomUUID(), randomUUID(), randomUUID()];
const sid = ids.map(id => `test-${id}`);
const base = "https://finance.test";
const event = { externalId: "fact-1", title: "Evidence fixture", content: "Test", markerLabel: "产品", occurredAt: "2026-10-14", eventType: "company.product", sources: [{ url: "https://example.com/fact" }] };
const body = (pack = "research", deliveryId = "d1", baseRevision = 0) => ({ deliveryId, baseRevision, document: { pack: { id: pack, name: "Test research", symbols: ["AAPL"] }, events: [event] } });
function req(path: string, method = "GET", data?: unknown, owner?: number, token?: string, origin = base) {
  return new NextRequest(base + path, { method, headers: { ...(owner === undefined ? {} : { cookie: `finance_sid=${sid[owner]}` }), ...(token ? { authorization: `Bearer ${token}` } : {}), origin, "content-type": "application/json" }, ...(data === undefined ? {} : { body: typeof data === "string" ? data : JSON.stringify(data) }) });
}
const path = "/api/user/event-packs", credentialPath = path + "/credential";
async function credential(owner: number, packId = "research") {
  const r = await issue(req(credentialPath, "POST", { userId: ids[owner], packId }, owner)); assert.equal(r.status, 200);
  const data = await r.json(); assert.ok(data.token.startsWith("evt_")); return data.token as string;
}
async function browserEndToEnd() {
  const token = await credential(2, "browser-e2e");
  const built = await build({ stdin: { contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {useLocalCompanyEvents} from '@/lib/equity/useLocalCompanyEvents';
import {milestoneToMarketEventDto} from '@/lib/equity/companyMilestones';
import {selectChartEvents} from '@/lib/chart/eventSelection';
import {DEFAULT_EVENT_VIEW_FILTERS} from '@/lib/chart/eventViewFilters';
function App(){const store=useLocalCompanyEvents('AAPL');window.e2eStore=store;window.e2eSelection=selectChartEvents(store.events.map(milestoneToMarketEventDto),[],DEFAULT_EVENT_VIEW_FILTERS,'2026-01-01','2026-12-31');return <p>{store.events.length} events</p>;}
createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "no-client-db", setup(b) { b.onResolve({ filter: /^@\/lib\/prisma$/ }, () => ({ path: "prisma", namespace: "test" })); b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const prisma={};" })); } }] });
  const server = createServer(async (incoming, outgoing) => {
    try {
      if (incoming.url === "/app.js") { outgoing.setHeader("content-type", "application/javascript"); outgoing.end(built.outputFiles[0].text); return; }
      if (!incoming.url?.startsWith("/api/")) { outgoing.setHeader("content-type", "text/html"); outgoing.end('<div id="root"></div><script src="/app.js"></script>'); return; }
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const request = new NextRequest(`http://${incoming.headers.host}${incoming.url}`, { method: incoming.method, headers: incoming.headers as Record<string, string>, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
      const result = incoming.url === "/api/auth/me" ? Response.json({ user: await getUserByRequest(request) }) : incoming.method === "POST" ? await POST(request) : await GET(request);
      outgoing.statusCode = result.status; result.headers.forEach((v, k) => outgoing.setHeader(k, v)); outgoing.end(await result.text());
    } catch { outgoing.statusCode = 503; outgoing.end('{"error":"fixture transport failed"}'); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test server");
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.context().addCookies([{ name: "finance_sid", value: sid[2], domain: "127.0.0.1", path: "/", httpOnly: true }]);
    await page.addInitScript(({ userId, localEvent }) => localStorage.setItem(`event-packs:v2:${userId}`, JSON.stringify([{ id: "browser-e2e", name: "Local", target: "symbol", symbols: ["AAPL"], enabled: true, importedAt: "2026-10-28", events: [localEvent] }])), { userId: ids[2], localEvent: { ...event, title: "Independent local fact", occurredAt: "2026-10-15", sourceUrl: "https://example.com/local-only", sources: [] } });
    const origin = `http://127.0.0.1:${address.port}`;
    await page.goto(origin);
    await page.waitForFunction(() => window.e2eStore?.events.length === 1 && Boolean(window.e2eStore.cloud.syncedAt));
    const delivered = await page.request.post(origin + path, { headers: { authorization: `Bearer ${token}` }, data: body("browser-e2e") });
    assert.equal(delivered.status(), 200);
    await page.evaluate(() => window.e2eStore.cloud.refresh());
    await page.waitForFunction(() => window.e2eStore.events.length === 2);
    assert.equal(await page.evaluate(() => window.e2eSelection.chartEvents.length), 2);
    await page.evaluate(() => window.e2eStore.updatePack("browser-e2e", { enabled: false }, "cloud"));
    assert.equal((await page.request.post(origin + path, { headers: { authorization: `Bearer ${token}` }, data: body("browser-e2e", "revision-2", 1) })).status(), 200);
    await page.evaluate(() => window.e2eStore.cloud.refresh());
    await page.waitForFunction(() => window.e2eStore.cloud.packs.find((p) => p.id === "browser-e2e")?.revision === 2);
    assert.equal(await page.evaluate(() => window.e2eStore.events.length), 1, "real delivery must not reenable a stopped cloud package");
    assert.equal(await page.evaluate(() => window.e2eStore.localPacks[0].events[0].title), "Independent local fact");
    console.log("PASS end-to-end: Bearer HTTP delivery -> real PostgreSQL -> real session GET -> browser hooks -> chart selection; same-ID local independence; stopped package remains stopped.");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

async function main() {
try {
  for (let i = 0; i < ids.length; i++) {
    await prisma.user.create({ data: { id: ids[i], username: `evt_${ids[i]}`, passHash: "test", passSalt: "test", role: "user", createdAt: new Date() } });
    await prisma.session.create({ data: { token: sid[i], userId: ids[i], createdAt: new Date(), expiresAt: new Date(Date.now() + 600000) } });
  }
  assert.equal((await GET(req(path))).status, 401);
  assert.equal((await issue(req(credentialPath, "POST", { userId: ids[0], packId: "research" }, 0, undefined, "https://other.test"))).status, 403);
  assert.equal((await issue(req(credentialPath, "POST", { userId: ids[1], packId: "research" }, 0))).status, 409);
  const tokenA = await credential(0), tokenB = await credential(1);
  assert.equal((await POST(req(path, "POST", body(), 0))).status, 401, "session alone cannot deliver");
  assert.equal((await GET(req(path, "GET", undefined, undefined, tokenA))).status, 401, "write-only bearer cannot read");
  assert.equal((await POST(req(path, "POST", body("other"), undefined, tokenA))).status, 403);
  const saved = await POST(req(path, "POST", body(), undefined, tokenA)); assert.equal(saved.status, 200);
  const receipt = await saved.json(); assert.equal(receipt.revision, 1); assert.equal(receipt.added, 1);
  const duplicate = await (await POST(req(path, "POST", body(), undefined, tokenA))).json(); assert.equal(duplicate.duplicate, true); assert.equal(duplicate.revision, 1);
  assert.equal((await POST(req(path, "POST", { ...body(), document: { ...body().document, events: [{ ...event, title: "changed" }] } }, undefined, tokenA))).status, 409);
  assert.equal((await POST(req(path, "POST", body("research", "d2", 0), undefined, tokenA))).status, 409);
  assert.equal((await POST(req(path, "POST", { ...body(), userId: ids[0] }, undefined, tokenB))).status, 400);
  assert.equal((await (await GET(req(path, "GET", undefined, 1))).json()).packs.length, 0);
  assert.equal((await POST(req(path, "POST", body(), undefined, tokenB))).status, 200);
  assert.equal(await prisma.privateEventPack.count({ where: { userId: { in: ids } } }), 2);
  const list = await (await GET(req(path, "GET", undefined, 0))).json(); assert.equal(list.userId, ids[0]); assert.equal(list.packs.length, 1); assert.equal(JSON.stringify(list).includes(tokenA), false); assert.equal(JSON.stringify(list).includes("tokenHash"), false);
  assert.equal((await POST(req(path, "POST", "x".repeat(1000001), undefined, tokenA))).status, 413);
  const invalid = { ...body("research", "d2", 1), document: { ...body().document, events: [event, { ...event, externalId: "invalid", occurredAt: "2026-02-31" }] } };
  assert.equal((await POST(req(path, "POST", invalid, undefined, tokenA))).status, 400);
  assert.equal((await prisma.privateEventPack.findUniqueOrThrow({ where: { userId_packId: { userId: ids[0], packId: "research" } } })).revision, 1);
  const concurrentToken = await credential(0, "concurrent");
  const same = await Promise.all(Array.from({ length: 4 }, () => POST(req(path, "POST", body("concurrent"), undefined, concurrentToken))));
  assert.ok(same.some(r => r.status === 200)); assert.ok(same.every(r => [200, 409].includes(r.status)));
  assert.equal((await (await POST(req(path, "POST", body("concurrent"), undefined, concurrentToken))).json()).duplicate, true);
  const competing = await Promise.all(["v2-a", "v2-b"].map(d => POST(req(path, "POST", body("concurrent", d, 1), undefined, concurrentToken))));
  assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
  assert.equal((await prisma.privateEventPack.findUniqueOrThrow({ where: { userId_packId: { userId: ids[0], packId: "concurrent" } } })).revision, 2);
  const rotated = await credential(0); assert.equal((await POST(req(path, "POST", body(), undefined, tokenA))).status, 401);
  assert.equal((await POST(req(path, "POST", body(), undefined, rotated))).status, 200);
  assert.equal((await revoke(req(credentialPath, "DELETE", { userId: ids[0], packId: "research" }, 0))).status, 200);
  assert.equal((await POST(req(path, "POST", body(), undefined, rotated))).status, 401);
  await prisma.eventDeliveryCredential.update({ where: { userId_packId: { userId: ids[1], packId: "research" } }, data: { expiresAt: new Date(0) } });
  assert.equal((await POST(req(path, "POST", body(), undefined, tokenB))).status, 401);
  await browserEndToEnd();
  await prisma.user.update({ where: { id: ids[0] }, data: { status: "suspended" } });
  assert.equal((await POST(req(path, "POST", body("concurrent", "d3", 2), undefined, concurrentToken))).status, 401);
  assert.equal((await GET(req(path, "GET", undefined, 0))).status, 401);
  console.log("PASS: real PostgreSQL + actual API handlers: account isolation, write-only pack-bound tokens, idempotence, concurrent CAS, no partial write, rotation/revoke/expiry/suspension, size and origin checks.");
} finally {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}

}
main().catch(e => { console.error(e); process.exitCode = 1; });
