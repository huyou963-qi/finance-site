import assert from "node:assert/strict";
import { afterEach, before, beforeEach, mock, test } from "node:test";
import type { PrismaClient } from "@prisma/client";

const prisma = {
  equitySecurity: {
    findMany: async () => [],
    findUnique: async () => {
      throw new Error("Local catalog unavailable");
    },
  },
};
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma as unknown as PrismaClient;
let searchUsEquitySymbols: typeof import("./usEquitySearch").searchUsEquitySymbols;
let isKnownUsSymbol: typeof import("./usEquitySearch").isKnownUsSymbol;
before(async () => {
  ({ isKnownUsSymbol, searchUsEquitySymbols } = await import("./usEquitySearch"));
});

beforeEach(() => {
  mock.method(globalThis, "fetch", async () => {
    throw new Error("SEC unavailable");
  });
});

afterEach(() => mock.restoreAll());

test("SOXX is searchable by ticker even when SEC and the local catalog have no result", async () => {
  for (const query of ["SOXX", "soxx", " soxx ", "SOX"]) {
    const results = await searchUsEquitySymbols(query);
    assert.equal(results[0]?.symbol, "SOXX");
    assert.equal(results[0]?.type, "ETF");
    assert.equal(results.filter((item) => item.symbol === "SOXX").length, 1);
  }
});

test("SOXX is searchable by English and Chinese names, including the non-SEC search path", async () => {
  for (const query of ["半导体", "半导体ETF", "芯片", "iShares Semiconductor", "semiconductor"]) {
    const results = await searchUsEquitySymbols(query, 20, false);
    assert.ok(results.some((item) => item.symbol === "SOXX"), query);
  }
});

test("SOXX is recognized without an external catalog lookup", async () => {
  assert.equal(await isKnownUsSymbol(" soxx "), true);
});

test("common asset codes, platform prefixes and Chinese names work without SEC", async () => {
  for (const [query, symbol] of [["US2Y", "US2Y"], ["US02YT", "US2Y"], ["TVC:US2Y", "US2Y"],
    ["两年期国债", "US2Y"], ["2年国债", "US2Y"], ["SPX", "^GSPC"],
    ["NAS100", "^NDX"], ["TVC:DXY", "DX-Y.NYB"], ["EURUSD", "EURUSD=X"],
    ["BTCUSD", "BTC-USD"], ["NASDAQ:SOXX", "SOXX"]]) {
    const results = await searchUsEquitySymbols(query, 20, false);
    assert.equal(results[0]?.symbol, symbol, query);
  }
});
