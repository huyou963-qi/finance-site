import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeMarketPathStats, summarizeRegimePath } from "./sectorStageTransmission";
import type { StoredRegime } from "@/lib/quant/macroRegime";

function regime(
  date: string,
  dalioRegime: StoredRegime["dalioRegime"],
): StoredRegime {
  return {
    date,
    regime: "recovery",
    dalioRegime,
    growthState: "above",
    growthDirection: "rising",
    inflationState: "falling",
    recession: 0,
    inputs: {} as StoredRegime["inputs"],
  };
}

describe("sectorStageTransmission", () => {
  it("uses only in-range values for return and max drawdown", () => {
    const result = computeMarketPathStats([
      { date: "2020-01-02", value: 100 },
      { date: "2020-01-03", value: 120 },
      { date: "2020-01-06", value: 90 },
      { date: "2020-01-07", value: 110 },
    ]);
    assert.ok(result.absoluteReturn != null && Math.abs(result.absoluteReturn - 0.1) < 1e-12);
    assert.ok(result.maxDrawdown != null && Math.abs(result.maxDrawdown + 0.25) < 1e-12);
    assert.equal(result.startTradeDate, "2020-01-02");
    assert.equal(result.endTradeDate, "2020-01-07");
  });

  it("returns null market results when an ETF has fewer than two observations", () => {
    const result = computeMarketPathStats([{ date: "2020-01-02", value: 100 }]);
    assert.equal(result.absoluteReturn, null);
    assert.equal(result.maxDrawdown, null);
    assert.equal(result.startTradeDate, null);
  });

  it("counts Dalio regime composition and transitions", () => {
    const result = summarizeRegimePath([
      regime("2020-01-31", "goldilocks"),
      regime("2020-02-28", "goldilocks"),
      regime("2020-03-31", "deflation"),
      regime("2020-04-30", null),
    ]);
    assert.equal(result.composition.goldilocks?.months, 2);
    assert.equal(result.composition.goldilocks?.share, 0.5);
    assert.equal(result.composition.deflation?.months, 1);
    assert.equal(result.composition.unknown?.months, 1);
    assert.equal(result.transitions, 2);
  });
});
