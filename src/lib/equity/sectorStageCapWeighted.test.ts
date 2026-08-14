import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateCapWeightedFactorRows,
  computeSectorReturnBridge,
  type CapWeightedSectorSnapshot,
} from "./sectorStageCapWeighted";

function snapshot(input: {
  earningsFlow: number;
  earningsMarketCap: number;
  salesFlow?: number;
  salesMarketCap?: number;
}): CapWeightedSectorSnapshot {
  const basis = (flow: number, marketCap: number) => ({
    flow,
    marketCap,
    coverage: 0.9,
    sampleCount: 20,
  });
  return {
    sector: "Information Technology",
    date: "2020-01-31",
    universeCount: 25,
    pricedCount: 24,
    totalMarketCap: input.earningsMarketCap,
    metrics: {},
    bridgeBases: {
      earnings: basis(input.earningsFlow, input.earningsMarketCap),
      sales: basis(
        input.salesFlow ?? 500,
        input.salesMarketCap ?? input.earningsMarketCap,
      ),
      cashFlow: basis(80, input.earningsMarketCap),
    },
  };
}

describe("sectorStageCapWeighted", () => {
  it("weights company ratios by PIT market cap and reconstructs aggregate earnings yield", () => {
    const rows = [
      { symbol: "A", factorKey: "logMarketCap", value: Math.log(100) },
      { symbol: "A", factorKey: "earningsYield", value: 0.1 },
      { symbol: "A", factorKey: "revenueYoY", value: 0.1 },
      { symbol: "A", factorKey: "opMargin", value: 0.2 },
      { symbol: "B", factorKey: "logMarketCap", value: Math.log(300) },
      { symbol: "B", factorKey: "earningsYield", value: 0.05 },
      { symbol: "B", factorKey: "revenueYoY", value: 0.3 },
    ];
    const result = aggregateCapWeightedFactorRows(
      "2020-01-31",
      rows,
      new Map([
        ["A", "Information Technology"],
        ["B", "Information Technology"],
      ]),
    ).get("Information Technology")!;

    assert.ok(Math.abs(result.totalMarketCap! - 400) < 1e-9);
    assert.ok(Math.abs(result.metrics.earningsYield!.value! - 0.0625) < 1e-12);
    assert.ok(Math.abs(result.bridgeBases.earnings.flow! - 25) < 1e-9);
    assert.ok(Math.abs(result.metrics.revenueYoY!.value! - 0.25) < 1e-12);
    assert.ok(Math.abs(result.metrics.opMargin!.coverage! - 0.25) < 1e-12);
    assert.equal(result.metrics.opMargin!.sampleCount, 1);
  });

  it("keeps the return bridge additive and leaves mismatch in residual", () => {
    const bridge = computeSectorReturnBridge({
      totalReturn: 0.4,
      priceReturn: 0.36,
      start: snapshot({ earningsFlow: 100, earningsMarketCap: 1_000 }),
      end: snapshot({ earningsFlow: 120, earningsMarketCap: 1_320 }),
    });
    assert.equal(bridge.available, true);
    assert.equal(bridge.basis, "earnings");
    const summed =
      bridge.fundamentalContribution! +
      bridge.valuationContribution! +
      bridge.dividendContribution! +
      bridge.residual!;
    assert.ok(Math.abs(summed - bridge.totalLogReturn!) < 1e-12);
    assert.ok(
      Math.abs(
        bridge.dividendContribution! - (Math.log1p(0.4) - Math.log1p(0.36)),
      ) < 1e-12,
    );
  });

  it("falls back to sales when aggregate earnings are non-positive", () => {
    const bridge = computeSectorReturnBridge({
      totalReturn: 0.1,
      priceReturn: 0.08,
      start: snapshot({
        earningsFlow: -10,
        earningsMarketCap: 1_000,
        salesFlow: 500,
      }),
      end: snapshot({
        earningsFlow: 20,
        earningsMarketCap: 1_100,
        salesFlow: 550,
      }),
    });
    assert.equal(bridge.available, true);
    assert.equal(bridge.basis, "sales");
    assert.match(bridge.warnings[0]!, /降级为TTM 营收桥/);
  });
});
