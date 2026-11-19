import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { loadFundamentalsCoverage } from "./fundamentalsCoverage";

test("company coverage retains newly named stocks and excludes a verified CVR holding without excluding its named company's stock", async () => {
  const db = {
    equityFundamentalSnapshot: { groupBy: async () => [{ symbol: "EQR" }] },
    equitySecurity: { findMany: async () => [{ symbol: "AAPL" }] },
    indexConstituent: {
      groupBy: async () => [{ indexCode: "SP500", _max: { asOfDate: new Date("2026-10-31") } }],
      findMany: async () => ["2602335D", "VMRK", "SKYD", "VYLR", "TPG", "AAPL"].map(symbol => ({ symbol })),
    },
  } as unknown as PrismaClient;
  assert.deepEqual([...await loadFundamentalsCoverage(db)].sort(), ["AAPL", "EQR", "SKYD", "TPG", "VMRK", "VYLR"]);
});
