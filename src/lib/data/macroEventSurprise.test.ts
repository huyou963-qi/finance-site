import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyMacroEventSurprise, macroSurpriseMarkerColor, evaluateMacroSurprise, expandEventAssetTags, isMacroResearchAsset } from "./macroEventSurprise";

const release = {
  actual: 230, consensus: 150, unit: "千人", referencePeriod: "2026-09",
  releaseAt: "2026-10-02T12:30:00Z", consensusAsOf: "2026-10-02T12:00:00Z",
  consensusSource: "测试调查", consensusSourceUrl: "https://example.com/survey",
  actualSourceUrl: "https://example.com/release", isInitialRelease: true,
};
const history = Array.from({ length: 12 }, (_, i) => ({
  releaseAt: `2025-${String(i + 1).padStart(2, "0")}-01T12:30:00Z`, actual: i % 2 ? 150 : 50, consensus: 100,
}));

describe("macro surprise evidence", () => {
  it("historical survey reports show raw differences without inventing a pre-release timestamp", () => {
    const historical = { ...release, consensusAsOf: undefined, consensusEvidenceType: "contemporaneous-report", historicalErrors: history };
    const result = evaluateMacroSurprise({ macroRelease: historical });
    assert.equal(result.status, "raw"); assert.equal(result.difference, 80);
    assert.equal(result.score, undefined); assert.equal(result.large, false);
    assert.equal(evaluateMacroSurprise({ macroRelease: { ...historical, consensusAsOf: release.releaseAt } }).status, "invalid");
  });
  it("never infers surprise from narrative or target prices", () => {
    assert.equal(evaluateMacroSurprise({ targetPrice: 5000, content: "大幅超预期" }).status, "missing");
  });
  it("requires pre-release consensus, timezone and initial-release evidence", () => {
    for (const override of [{ consensusAsOf: release.releaseAt }, { consensusAsOf: "2026-10-02" }, { isInitialRelease: false }, { actual: "230" }, { actualSourceUrl: "javascript:alert(1)" }]) {
      assert.equal(evaluateMacroSurprise({ macroRelease: { ...release, ...override } }).status, "invalid");
    }
  });
  it("keeps a raw difference without manufacturing a standardized score", () => {
    const r = evaluateMacroSurprise({ macroRelease: release });
    assert.equal(r.status, "raw"); assert.equal(r.difference, 80); assert.equal(r.large, false);
  });
  it("excludes future samples and duplicates from scale", () => {
    const baseline = evaluateMacroSurprise({ macroRelease: { ...release, historicalErrors: history } });
    const augmented = evaluateMacroSurprise({ macroRelease: { ...release, historicalErrors: [...history, history[0], { releaseAt: "2026-11-01T12:30:00Z", actual: 9999, consensus: 0 }] } });
    assert.equal(baseline.status, "scored"); assert.equal(baseline.sampleSize, 12);
    assert.equal(baseline.direction, "above"); assert.equal(baseline.large, true);
    assert.equal(augmented.score, baseline.score);
  });
  it("zero scale remains unscored; equal actual and consensus is inline", () => {
    assert.equal(evaluateMacroSurprise({ macroRelease: { ...release, historicalErrors: history.map(h => ({ ...h, actual: 100 })) } }).status, "raw");
    assert.equal(evaluateMacroSurprise({ macroRelease: { ...release, actual: 150, historicalErrors: history } }).direction, "inline");
  });
  it("expands gold event relevance without including other commodity assets", () => {
    assert.ok(expandEventAssetTags([" xauusd "]).includes("GC=F"));
    assert.ok(expandEventAssetTags(["GLD"]).includes("XAUUSD"));
    assert.deepEqual(expandEventAssetTags(["CL=F"]), ["CL=F"]);
    assert.equal(isMacroResearchAsset("CL=F"), false);
  });
});

describe("provisional component surprise thresholds", () => {
  const cpi = { ...release, metricId: "ex-food-energy-m-m", label: "核心CPI环比", unit: "%", actual: 0.3, consensus: 0.2,
    consensusAsOf: undefined, consensusEvidenceType: "contemporaneous-report" };
  it("classifies historical survey evidence without manufacturing a z-score", () => {
    assert.equal(classifyMacroEventSurprise({ macroRelease: cpi }).level, "small");
    const r = classifyMacroEventSurprise({ macroRelease: { ...cpi, actual: 0.4 } });
    assert.equal(r.level, "large"); assert.equal(r.direction, "above"); assert.equal(r.decisive?.strength, 1);
    assert.equal(evaluateMacroSurprise({ macroRelease: { ...cpi, actual: 0.4 } }).score, undefined);
  });
  it("finds a large secondary component, avoids double counting and catches mixed signs", () => {
    const nfp = { ...release, metricId: "nonfarm-payrolls-m-m", unit: "人", actual: 100000, consensus: 90000 };
    const unemployment = { ...release, metricId: "unemployment-rate", unit: "%", actual: 4.1, consensus: 4.3 };
    const r = classifyMacroEventSurprise({ macroRelease: nfp, macroReleaseComponents: [nfp, unemployment] });
    assert.equal(r.level, "large"); assert.equal(r.decisive?.evidence.metricId, "unemployment-rate");
    assert.equal(r.components.length, 2); assert.equal(r.direction, "below");
    const mixed = classifyMacroEventSurprise({ macroRelease: { ...nfp, actual: 170000 }, macroReleaseComponents: [unemployment] });
    assert.equal(mixed.direction, "mixed"); assert.equal(macroSurpriseMarkerColor(mixed), "#a855f7");
  });
  it("does not confuse CPI and PPI metric ids", () => {
    const r = classifyMacroEventSurprise({ macroRelease: { ...cpi, label: "PPI剔除食品能源环比", actual: 0.4 } });
    assert.equal(r.level, "small"); assert.equal(r.decisive?.threshold, 0.3);
  });
  it("rejects wrong units, invalid sources, different publications and unconfigured metrics", () => {
    for (const override of [{ unit: "指数" }, { metricId: "manufacturing-payrolls-m-m" }, { actualSourceUrl: "javascript:x" }, { isInitialRelease: false }]) {
      assert.equal(classifyMacroEventSurprise({ macroRelease: { ...cpi, actual: 1, ...override } }).level, "unassessed");
    }
    assert.equal(classifyMacroEventSurprise({ policyOutcome: { actual: 4 } }).level, "unassessed");
    assert.equal(classifyMacroEventSurprise({ macroRelease: cpi, macroReleaseComponents: [{ ...cpi, actual: 1, referencePeriod: "2026-08" }] }).level, "small");
    assert.equal(classifyMacroEventSurprise({ macroRelease: { ...cpi, actual: cpi.consensus } }).decisive?.strength, 0);
  });
  it("uses deterministic thresholds regardless of later observations or survey range width", () => {
    const r = classifyMacroEventSurprise({ macroRelease: { ...cpi, actual: 0.4, consensusRange: "0.1% to 0.4%", historicalErrors: history } });
    assert.equal(r.level, "large"); assert.equal(macroSurpriseMarkerColor(r), "#e11d48");
    assert.equal(macroSurpriseMarkerColor(classifyMacroEventSurprise({ macroRelease: cpi })), undefined);
  });
});
