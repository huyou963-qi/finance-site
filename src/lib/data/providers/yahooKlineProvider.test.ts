import assert from "node:assert/strict";
import { it, type TestContext } from "node:test";
import type { PrismaClient } from "@prisma/client";

// Plain delegates allow node:test to replace methods without Prisma's Proxy.
const prisma = {
  equityPriceCoverage: { findMany: async () => [], findUnique: async () => null },
  equitySplit: { findMany: async () => [] },
  equityDailyBar: {
    findMany: async () => [],
    findFirst: async (_query: { where: { symbol: string; date: { lt: Date }; close: { gt: number } } }): Promise<{ date: Date } | null> => null,
  },
};
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma as unknown as PrismaClient;

const DAY = 86400;
const START = Date.parse("2025-03-21T00:00:00Z") / 1000;

function rows(count: number, dirty = 0) {
  return Array.from({ length: count }, (_, i) => ({
    date: new Date((START + i * DAY) * 1000),
    open: 3000, high: 3010, low: 2990,
    close: i >= count - dirty ? 0 : 3000,
    adjClose: 3000, volume: 100,
  }));
}

function stubDb(t: TestContext, bars: ReturnType<typeof rows>, older: boolean) {
  const coverage = {
    symbol: "GC=F", fullHistory: true, notFound: false,
    firstDate: new Date("2000-08-30"), lastDate: new Date(),
    lastCheckedAt: new Date(), source: "yahoo",
  };
  t.mock.method(prisma.equityPriceCoverage, "findMany", async () => [coverage]);
  t.mock.method(prisma.equityPriceCoverage, "findUnique", async () => coverage);
  t.mock.method(prisma.equitySplit, "findMany", async () => []);
  t.mock.method(prisma.equityDailyBar, "findMany", async () => [...bars].reverse());
  return t.mock.method(prisma.equityDailyBar, "findFirst", async () => older ? { date: new Date("2000-08-30") } : null);
}

it("keeps daily history available when 400 DB rows become 398 valid candles", async (t) => {
  const { yahooKlineProvider } = await import("./yahooKlineProvider");
  const lookup = stubDb(t, rows(400, 2), true);
  const page = await yahooKlineProvider.fetch({
    symbol: "GC=F", interval: "1d", limit: 400, adjustment: "forward", window: {},
  });
  assert.equal(page.candles.length, 398);
  assert.equal(page.hasMoreOlder, true);
  assert.deepEqual(lookup.mock.calls[0]!.arguments[0]!.where, {
    symbol: "GC=F", date: { lt: new Date(START * 1000) }, close: { gt: 0 },
  });
});

it("stops at the actual history boundary even when the last page is full", async (t) => {
  const { yahooKlineProvider } = await import("./yahooKlineProvider");
  stubDb(t, rows(400), false);
  const page = await yahooKlineProvider.fetch({
    symbol: "GC=F", interval: "1d", limit: 400, adjustment: "none", window: {},
  });
  assert.equal(page.candles.length, 400);
  assert.equal(page.hasMoreOlder, false);
});

it("checks before the oldest Monday for weekly history", async (t) => {
  const { yahooKlineProvider } = await import("./yahooKlineProvider");
  const lookup = stubDb(t, rows(20), true);
  const page = await yahooKlineProvider.fetch({
    symbol: "GC=F", interval: "1w", limit: 400, adjustment: "none", window: {},
  });
  assert.equal(page.hasMoreOlder, true);
  assert.equal(lookup.mock.calls[0]!.arguments[0]!.where.date.lt.toISOString(), "2025-03-17T00:00:00.000Z");
});
