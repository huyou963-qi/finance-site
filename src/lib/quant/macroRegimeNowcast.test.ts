import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyMacroRegimeNowcast,
  type RegimeNowcastIndicator,
} from "./macroRegime";

function indicator(options: Partial<RegimeNowcastIndicator> & Pick<RegimeNowcastIndicator, "code" | "axis">): RegimeNowcastIndicator {
  const { code, axis, ...overrides } = options;
  const signal = overrides.signal ?? 0.8;
  return {
    code,
    labelZh: code,
    axis,
    role: "core",
    unit: "index",
    latestDate: "2026-08-21",
    latestValue: 1,
    comparisonDate: "2026-07-24",
    comparisonValue: 0,
    change: 1,
    changeKind: "absolute",
    signal,
    weight: 1,
    vote: signal >= 0.2 ? 1 : signal <= -0.2 ? -1 : 0,
    directionLabel: "测试",
    fresh: true,
    ...overrides,
  };
}

test("风险偏好与通胀定价同升形成再通胀交易背景", () => {
  const result = classifyMacroRegimeNowcast({
    indicators: [
      indicator({ code: "risk-1", axis: "risk", signal: 0.8 }),
      indicator({ code: "risk-2", axis: "risk", signal: 0.6 }),
      indicator({ code: "inflation-1", axis: "inflation", signal: 0.7 }),
      indicator({ code: "inflation-2", axis: "inflation", signal: 0.5 }),
      indicator({ code: "policy", axis: "policy", signal: -0.4 }),
    ],
  });
  assert.equal(result.regime, "reflation");
  assert.equal(result.riskDirection, "rising");
  assert.equal(result.inflationState, "rising");
  assert.equal(result.confidence, "high");
  assert.equal(result.coverage, 1);
});

test("过期数据不借用月度锚填补周度方向", () => {
  const result = classifyMacroRegimeNowcast({
    indicators: [
      indicator({ code: "risk-stale", axis: "risk", signal: 1, fresh: false }),
      indicator({ code: "inflation-stale", axis: "inflation", signal: 1, fresh: false }),
      indicator({ code: "policy", axis: "policy", signal: 1 }),
    ],
  });
  assert.equal(result.regime, null);
  assert.equal(result.riskDirection, null);
  assert.equal(result.inflationState, null);
  assert.equal(result.riskScore, 0);
  assert.equal(result.inflationScore, 0);
  assert.equal(result.confidence, "low");
  assert.equal(result.coverage, 0);
});

test("诊断项展示但不重复进入核心轴计权", () => {
  const result = classifyMacroRegimeNowcast({
    indicators: [
      indicator({ code: "risk", axis: "risk", signal: 0.7 }),
      indicator({ code: "inflation", axis: "inflation", signal: 0.6 }),
      indicator({ code: "duplicate-inflation", axis: "inflation", role: "diagnostic", weight: 0, signal: -1 }),
    ],
  });
  assert.equal(result.regime, "reflation");
  assert.equal(result.inflationScore, 0.6);
});

test("慢频确认背离会降低高置信度", () => {
  const result = classifyMacroRegimeNowcast({
    indicators: [
      indicator({ code: "risk", axis: "risk", signal: 0.7 }),
      indicator({ code: "inflation", axis: "inflation", signal: 0.6 }),
      indicator({ code: "financial", axis: "financial", role: "confirmation", signal: -0.8 }),
    ],
  });
  assert.equal(result.confirmation, "divergent");
  assert.equal(result.confidence, "medium");
});
