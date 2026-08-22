import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyMacroRegimeNowcast,
  type RegimeNowcastIndicator,
} from "./macroRegime";

function indicator(options: Partial<RegimeNowcastIndicator> & Pick<RegimeNowcastIndicator, "code" | "axis" | "vote">): RegimeNowcastIndicator {
  const { code, axis, vote, ...overrides } = options;
  return {
    code,
    labelZh: code,
    axis,
    latestDate: "2026-08-21",
    latestValue: 1,
    comparisonDate: "2026-07-24",
    comparisonValue: 0,
    change: 1,
    changeKind: "absolute",
    vote,
    directionLabel: "测试",
    fresh: true,
    ...overrides,
  };
}

test("新鲜增长与通胀证据可形成高置信度实时象限", () => {
  const result = classifyMacroRegimeNowcast({
    fallbackGrowth: "falling",
    fallbackInflation: "falling",
    indicators: [
      indicator({ code: "growth-1", axis: "growth", vote: 1 }),
      indicator({ code: "growth-2", axis: "growth", vote: 1 }),
      indicator({ code: "inflation-1", axis: "inflation", vote: 1 }),
      indicator({ code: "inflation-2", axis: "inflation", vote: 1 }),
      indicator({ code: "rates", axis: "rates", vote: -1 }),
    ],
  });
  assert.equal(result.regime, "reflation");
  assert.equal(result.growthDirection, "rising");
  assert.equal(result.inflationState, "rising");
  assert.equal(result.confidence, "high");
  assert.equal(result.coverage, 1);
});

test("过期数据不参与方向投票且置信度降级", () => {
  const result = classifyMacroRegimeNowcast({
    fallbackGrowth: "falling",
    fallbackInflation: "falling",
    indicators: [
      indicator({ code: "growth-stale", axis: "growth", vote: 1, fresh: false }),
      indicator({ code: "inflation-stale", axis: "inflation", vote: 1, fresh: false }),
      indicator({ code: "rates", axis: "rates", vote: 1 }),
    ],
  });
  assert.equal(result.regime, "deflation");
  assert.equal(result.growthScore, 0);
  assert.equal(result.inflationScore, 0);
  assert.equal(result.confidence, "low");
  assert.equal(result.coverage, 1 / 3);
});
