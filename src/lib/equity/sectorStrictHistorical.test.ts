import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateStrictEtfSnapshot,
  computeStrictEtfReturnBridge,
  type StrictEtfConstituent,
} from "./sectorStrictHistorical";

function constituent(input: {
  symbol: string;
  weight: number;
  marketCap: number;
  revenueYoY: number;
  earnings: number;
  sales?: number;
}): StrictEtfConstituent {
  return {
    symbol: input.symbol,
    weight: input.weight,
    latestFilingAt: "2026-05-01",
    marketCap: input.marketCap,
    factors: {
      revenueYoY: input.revenueYoY,
      earningsYield: input.earnings / input.marketCap,
      salesYield: (input.sales ?? 500) / input.marketCap,
    },
    flows: {
      earnings: input.earnings,
      sales: input.sales ?? 500,
      cashFlow: null,
    },
  };
}

function snapshot(
  date: string,
  holdingsDate: string,
  constituents: StrictEtfConstituent[],
) {
  return aggregateStrictEtfSnapshot({
    sector: "Information Technology",
    etf: "XLK",
    date,
    holdingAsOfDate: holdingsDate,
    holdingTotalWeight: 1,
    classifiedWeight: 0.99,
    vintageWeight: 0.95,
    constituents,
  });
}

describe("sectorStrictHistorical", () => {
  it("weights endpoint metrics by actual ETF holding weight, not company market cap", () => {
    const result = snapshot("2026-06-30", "2026-06-30", [
      constituent({
        symbol: "A",
        weight: 0.75,
        marketCap: 100,
        revenueYoY: 0.1,
        earnings: 10,
      }),
      constituent({
        symbol: "B",
        weight: 0.25,
        marketCap: 900,
        revenueYoY: 0.5,
        earnings: 45,
      }),
    ]);
    assert.ok(Math.abs(result.metrics.revenueYoY!.value! - 0.2) < 1e-12);
    assert.equal(result.metrics.revenueYoY!.coverage, 1);
    assert.equal(result.method, "historical-etf-holdings");
  });

  it("uses matched start holdings and keeps the strict bridge additive", () => {
    const start = snapshot("2025-12-31", "2025-12-31", [
      constituent({ symbol: "A", weight: 0.7, marketCap: 100, revenueYoY: 0.1, earnings: 10 }),
      constituent({ symbol: "B", weight: 0.3, marketCap: 100, revenueYoY: 0.1, earnings: 10 }),
    ]);
    const end = snapshot("2026-06-30", "2026-06-30", [
      constituent({ symbol: "A", weight: 0.6, marketCap: 132, revenueYoY: 0.2, earnings: 12 }),
      constituent({ symbol: "B", weight: 0.25, marketCap: 90, revenueYoY: 0.0, earnings: 9 }),
      constituent({ symbol: "C", weight: 0.15, marketCap: 40, revenueYoY: 0.3, earnings: 4 }),
    ]);
    const bridge = computeStrictEtfReturnBridge({
      totalReturn: 0.3,
      priceReturn: 0.27,
      start,
      end,
    });
    assert.equal(bridge.available, true);
    assert.equal(bridge.method, "etf-holdings-matched-start-weight");
    assert.equal(bridge.holdingSnapshotStart, "2025-12-31");
    assert.equal(bridge.holdingSnapshotEnd, "2026-06-30");
    const sum = bridge.fundamentalContribution! + bridge.valuationContribution! +
      bridge.dividendContribution! + bridge.residual!;
    assert.ok(Math.abs(sum - bridge.totalLogReturn!) < 1e-12);
    assert.ok(Math.abs(bridge.coverage! - 0.85) < 1e-12);
  });

  it("refuses a strict decomposition when matched endpoint weight is below 60%", () => {
    const start = snapshot("2025-12-31", "2025-12-31", [
      constituent({ symbol: "A", weight: 0.55, marketCap: 100, revenueYoY: 0.1, earnings: 10 }),
    ]);
    const end = snapshot("2026-06-30", "2026-06-30", [
      constituent({ symbol: "A", weight: 0.55, marketCap: 110, revenueYoY: 0.1, earnings: 11 }),
    ]);
    const bridge = computeStrictEtfReturnBridge({ totalReturn: 0.1, priceReturn: 0.08, start, end });
    assert.equal(bridge.available, false);
    assert.equal(bridge.method, "etf-holdings-matched-start-weight");
  });
});
