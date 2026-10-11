/** Run: npx dotenv -e .env.local -- tsx scripts/test/market-watchlist-order.integration.ts */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../../src/lib/prisma";
import { GET, PATCH, POST, DELETE } from "../../src/app/api/tools/market-watchlist/route";

const host = new URL(process.env.DATABASE_URL ?? "").hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) throw new Error("Integration fixtures require a local database");
const ids = [randomUUID(), randomUUID()], tokens = [randomUUID(), randomUUID()];
const base = "http://localhost:3000/api/tools/market-watchlist";
function request(index: number | null, method = "GET", body?: object) {
  return new NextRequest(base, { method, headers: { ...(index === null ? {} : { Cookie: `finance_sid=${tokens[index]}` }), ...(body ? { "Content-Type": "application/json", Origin: "http://localhost:3000" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function symbols() { return (await (await GET(request(0))).json()).stocks.map((stock: { symbol: string }) => stock.symbol); }
async function main() {
  try {
    for (const [index, id] of ids.entries()) {
      await prisma.user.create({ data: { id, username: `watchlist-order-test-${id}`, role: "user", passHash: "disabled-test-account", passSalt: "disabled", createdAt: new Date() } });
      await prisma.session.create({ data: { token: tokens[index], userId: id, createdAt: new Date(), expiresAt: new Date(Date.now() + 600000) } });
    }
    await prisma.userMarketWatchlistItem.createMany({ data: ["AAPL", "MSFT"].map(symbol => ({ userId: ids[0], symbol, name: symbol, exchange: "NASDAQ" })) });
    await prisma.userMarketWatchlistItem.create({ data: { userId: ids[1], symbol: "OTHER", name: "other owner", exchange: "" } });
    assert.equal((await PATCH(request(null, "PATCH", { action: "reorderStocks", order: [] }))).status, 401);
    assert.equal((await PATCH(request(0, "PATCH", { userId: ids[1], action: "reorderStocks", order: [] }))).status, 409);
    for (const order of [["AAPL"], ["AAPL", "AAPL"], ["MSFT", "OTHER"]]) {
      assert.equal((await PATCH(request(0, "PATCH", { userId: ids[0], action: "reorderStocks", order }))).status, 400);
    }
    assert.equal((await PATCH(request(0, "PATCH", { userId: ids[0], action: "reorderStocks", order: ["MSFT", "AAPL"] }))).status, 200);
    assert.deepEqual(await symbols(), ["MSFT", "AAPL"]);
    const add = (symbol: string) => POST(request(0, "POST", { userId: ids[0], stock: { symbol, name: symbol, exchange: "NASDAQ" } }));
    assert.equal((await add("NVDA")).status, 200);
    assert.deepEqual(await symbols(), ["MSFT", "AAPL", "NVDA"]);
    assert.equal((await DELETE(request(0, "DELETE", { userId: ids[0], symbol: "MSFT" }))).status, 200);
    assert.equal((await add("MSFT")).status, 200);
    assert.deepEqual(await symbols(), ["AAPL", "NVDA", "MSFT"]);
    assert.deepEqual((await (await GET(request(1))).json()).stocks.map((stock: { symbol: string }) => stock.symbol), ["OTHER"]);
    console.log("Watchlist order integration passed: persistence, append/delete, owner isolation and stale-list validation");
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
