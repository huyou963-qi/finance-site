/** Run: npx dotenv -e .env.local -- tsx scripts/test/market-drawings.integration.ts
 * Uses isolated temporary users on a local DB only; always removes its own fixtures.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { GET, PUT } from "../../src/app/api/tools/market-drawings/route";
const host = new URL(process.env.DATABASE_URL ?? "").hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) throw new Error("Integration fixtures require a local database");
const users = [randomUUID(), randomUUID()];
const tokens = [randomUUID(), randomUUID()];
const base = "http://localhost:3000/api/tools/market-drawings?source=yahoo&symbol=AAPL&adjust=forward";
function request(index: number | null, body?: object) {
  return new NextRequest(base, { method: body ? "PUT" : "GET", headers: { ...(index === null ? {} : { Cookie: `finance_sid=${tokens[index]}` }), ...(body ? { "Content-Type": "application/json", Origin: "http://localhost:3000" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const drawing = { id: "test-drawing", kind: "hline", price: 123.45, color: "#38bdf8" };
async function main() {
try {
  for (const [i, id] of users.entries()) {
    await prisma.user.create({ data: { id, username: `drawing-test-${id}`, role: "user", passHash: "disabled-test-account", passSalt: "disabled", createdAt: new Date() } });
    await prisma.session.create({ data: { token: tokens[i], userId: id, createdAt: new Date(), expiresAt: new Date(Date.now() + 600000) } });
  }
  assert.equal((await PUT(request(null, { revision: 0, drawings: [] }))).status, 401);
  assert.equal((await PUT(request(0, { userId: users[0], revision: 0, drawings: [drawing] }))).status, 403);
  await prisma.userMarketWatchlistItem.create({ data: { userId: users[0], symbol: "AAPL", name: "Apple", exchange: "NASDAQ" } });
  assert.equal((await PUT(request(0, { userId: users[1], revision: 0, drawings: [drawing] }))).status, 409);
  assert.equal((await PUT(request(0, { userId: users[0], revision: 0, drawings: [{ ...drawing, price: "bad" }] }))).status, 400);
  assert.equal((await PUT(request(0, { userId: users[0], revision: 0, drawings: [drawing] }))).status, 200);
  const own = await (await GET(request(0))).json();
  assert.equal(own.cloud, true); assert.equal(own.revision, 1); assert.equal(own.drawings[0].price, 123.45);
  const other = await (await GET(request(1))).json();
  assert.equal(other.cloud, false); assert.deepEqual(other.drawings, []);
  assert.equal((await PUT(request(0, { userId: users[0], revision: 0, drawings: [] }))).status, 409);
  const concurrent = await Promise.all([PUT(request(0, { userId: users[0], revision: 1, drawings: [{ ...drawing, price: 124 }] })), PUT(request(0, { userId: users[0], revision: 1, drawings: [{ ...drawing, price: 125 }] }))]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  await prisma.userMarketWatchlistItem.delete({ where: { userId_symbol: { userId: users[0], symbol: "AAPL" } } });
  assert.equal((await PUT(request(0, { userId: users[0], revision: 2, drawings: [] }))).status, 403);
  const removed = await (await GET(request(0))).json();
  assert.equal(removed.cloud, false); assert.equal(removed.drawings.length, 1);
  console.log("Drawing API integration passed: authentication, ownership, watchlist gate, validation, revisions, concurrent writes, removal history");
} finally {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
}

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
