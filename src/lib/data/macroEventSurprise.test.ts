import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateMacroSurprise, expandEventAssetTags, isMacroResearchAsset } from "./macroEventSurprise";

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
