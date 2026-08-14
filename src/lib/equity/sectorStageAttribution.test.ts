import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  robustCrossSectionZ,
  scoreStageAttribution,
  type AttributionSectorInput,
  type StageMetricSnapshot,
} from "./sectorStageAttribution";

function metric(
  start: number,
  end: number,
  coverage = 0.95,
): StageMetricSnapshot {
  return {
    start,
    end,
    delta: end - start,
    p25Start: start - 0.01,
    p75Start: start + 0.01,
    p25End: end - 0.01,
    p75End: end + 0.01,
    coverageStart: coverage,
    coverageEnd: coverage,
    sampleStart: 20,
    sampleEnd: 20,
  };
}

function row(input: {
  sector: string;
  style: AttributionSectorInput["style"];
  delta: number;
  earningsYieldStart: number;
  earningsYieldEnd: number;
  absoluteReturn: number;
  excessVsSpy: number;
  expectedLeader?: boolean;
  coverage?: number;
}): AttributionSectorInput {
  const coverage = input.coverage ?? 0.95;
  return {
    sector: input.sector,
    style: input.style,
    expectedLeader: input.expectedLeader ?? false,
    fundamentals: {
      revenueYoY: metric(0, input.delta, coverage),
      epsYoY: metric(0, input.delta, coverage),
      opMargin: metric(0, input.delta, coverage),
      earningsYield: metric(input.earningsYieldStart, input.earningsYieldEnd, coverage),
    },
    absoluteReturn: input.absoluteReturn,
    excessVsSpy: input.excessVsSpy,
  };
}

describe("sectorStageAttribution", () => {
  it("computes median/MAD z-scores without using order", () => {
    const scores = robustCrossSectionZ(
      new Map([
        ["middle", 0],
        ["high", 10],
        ["low", -10],
      ]),
    );
    assert.equal(scores.get("middle"), 0);
    assert.ok((scores.get("high") ?? 0) > 0.5);
    assert.ok((scores.get("low") ?? 0) < -0.5);
  });

  it("separates earnings/valuation resonance, relative defense and deterioration", () => {
    const result = scoreStageAttribution([
      row({
        sector: "Technology",
        style: "growth",
        delta: 0.2,
        earningsYieldStart: 0.08,
        earningsYieldEnd: 0.04,
        absoluteReturn: 0.3,
        excessVsSpy: 0.2,
        expectedLeader: true,
      }),
      row({
        sector: "Staples",
        style: "defensive",
        delta: 0,
        earningsYieldStart: 0.06,
        earningsYieldEnd: 0.06,
        absoluteReturn: -0.05,
        excessVsSpy: 0.03,
      }),
      row({
        sector: "Energy",
        style: "cyclical",
        delta: -0.2,
        earningsYieldStart: 0.04,
        earningsYieldEnd: 0.08,
        absoluteReturn: -0.2,
        excessVsSpy: -0.1,
      }),
    ]);

    const technology = result.find((item) => item.sector === "Technology")!;
    const staples = result.find((item) => item.sector === "Staples")!;
    const energy = result.find((item) => item.sector === "Energy")!;
    assert.equal(technology.attribution.label, "盈利与估值共振");
    assert.equal(technology.theoryValidation, "confirmed");
    assert.equal(staples.attribution.label, "相对防御有效");
    assert.equal(energy.attribution.label, "基本面恶化");
  });

  it("does not attribute when core endpoint coverage is below 60%", () => {
    const rows = [
      row({
        sector: "LowCoverage",
        style: "growth",
        delta: 0.4,
        earningsYieldStart: 0.08,
        earningsYieldEnd: 0.04,
        absoluteReturn: 0.2,
        excessVsSpy: 0.1,
        coverage: 0.5,
      }),
      row({
        sector: "PeerA",
        style: "cyclical",
        delta: 0,
        earningsYieldStart: 0.06,
        earningsYieldEnd: 0.06,
        absoluteReturn: 0,
        excessVsSpy: 0,
      }),
      row({
        sector: "PeerB",
        style: "defensive",
        delta: -0.2,
        earningsYieldStart: 0.04,
        earningsYieldEnd: 0.08,
        absoluteReturn: -0.1,
        excessVsSpy: -0.1,
      }),
    ];
    const target = scoreStageAttribution(rows).find((item) => item.sector === "LowCoverage")!;
    assert.equal(target.attribution.fundamentalScore, null);
    assert.equal(target.attribution.label, "数据不足，不归因");
  });

  it("marks an expected leader with non-positive excess as rejected", () => {
    const target = scoreStageAttribution([
      row({
        sector: "Expected",
        style: "growth",
        delta: 0,
        earningsYieldStart: 0.06,
        earningsYieldEnd: 0.06,
        absoluteReturn: -0.1,
        excessVsSpy: -0.02,
        expectedLeader: true,
      }),
      row({
        sector: "Peer",
        style: "cyclical",
        delta: 0.1,
        earningsYieldStart: 0.06,
        earningsYieldEnd: 0.05,
        absoluteReturn: 0.1,
        excessVsSpy: 0.05,
      }),
    ]).find((item) => item.sector === "Expected")!;
    assert.equal(target.theoryValidation, "rejected");
    assert.equal(target.attribution.label, "理论未兑现");
  });
});
