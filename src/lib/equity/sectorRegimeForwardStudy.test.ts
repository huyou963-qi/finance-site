import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GicsSector } from "./gicsCatalog";
import {
  expandingMeanAsOf,
  neweyWestMeanInterval,
  rankNormalize,
  splitForEvaluation,
} from "./sectorRegimeForwardStudy";

describe("sectorRegimeForwardStudy", () => {
  it("never uses a label whose end is after the signal month", () => {
    const result = expandingMeanAsOf([
      { endIndex: 2, value: 0.1 },
      { endIndex: 4, value: 0.3 },
      { endIndex: 5, value: 99 },
    ], 4);
    assert.equal(result.count, 2);
    assert.ok(result.mean != null && Math.abs(result.mean - 0.2) < 1e-12);
  });

  it("purges labels that cross train or validation boundaries", () => {
    assert.equal(splitForEvaluation("2014-09-30", "2014-12-31"), "train");
    assert.equal(splitForEvaluation("2014-12-31", "2015-03-31"), null);
    assert.equal(splitForEvaluation("2019-09-30", "2019-12-31"), "validation");
    assert.equal(splitForEvaluation("2019-12-31", "2020-03-31"), null);
    assert.equal(splitForEvaluation("2020-01-31", "2020-04-30"), "test");
  });

  it("normalizes ranks to [-1, 1] and gives ties their average rank", () => {
    const values = new Map<GicsSector, number | null>([
      ["Energy", 1],
      ["Materials", 2],
      ["Industrials", 2],
      ["Financials", 4],
    ]);
    const ranked = rankNormalize(values);
    assert.equal(ranked.get("Energy"), -1);
    assert.equal(ranked.get("Financials"), 1);
    assert.equal(ranked.get("Materials"), 0);
    assert.equal(ranked.get("Industrials"), 0);
    assert.equal(ranked.get("Utilities"), null);
  });

  it("computes deterministic Newey-West mean intervals", () => {
    const result = neweyWestMeanInterval([0.1, 0.2, 0.3, 0.4], 1);
    assert.ok(result.mean != null && Math.abs(result.mean - 0.25) < 1e-12);
    assert.ok(result.se != null && result.se > 0);
    assert.ok(result.low != null && result.low < result.mean!);
    assert.ok(result.high != null && result.high > result.mean!);

    const constant = neweyWestMeanInterval([0.2, 0.2, 0.2], 2);
    assert.ok(constant.se != null && constant.se < 1e-12);
    assert.ok(constant.low != null && Math.abs(constant.low - 0.2) < 1e-12);
    assert.ok(constant.high != null && Math.abs(constant.high - 0.2) < 1e-12);
  });
});
