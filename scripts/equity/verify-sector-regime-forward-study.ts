import assert from "node:assert/strict";
import {
  SECTOR_FORWARD_HORIZONS,
  clearSectorRegimeForwardStudyCache,
  getSectorRegimeForwardStudy,
} from "../../src/lib/equity/sectorRegimeForwardStudy";
import { prisma } from "../../src/lib/prisma";

function round(value: number | null, digits = 4): number | null {
  return value == null ? null : Number(value.toFixed(digits));
}

function assertFiniteTree(value: unknown, path = "root"): void {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} is not finite`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteTree(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertFiniteTree(item, `${path}.${key}`);
    }
  }
}

async function main() {
  clearSectorRegimeForwardStudyCache();
  const coldStart = performance.now();
  const report = await getSectorRegimeForwardStudy();
  const coldMs = performance.now() - coldStart;
  const warmStart = performance.now();
  const warm = await getSectorRegimeForwardStudy();
  const warmMs = performance.now() - warmStart;

  assert.equal(warm, report, "warm cache must return the same response object");
  assert.equal(report.methodology.evidenceGrade, "C");
  assert.ok(report.sample.regimeMonths >= 250, "regime history is too short");
  assert.ok(report.sample.validRegimeMonths >= 200, "valid Dalio regime history is too short");
  assert.deepEqual(
    report.models.map((model) => model.id),
    ["unconditional", "regimeOnly", "regimeValuation", "regimeFundamental"],
  );
  for (const model of report.models) {
    assert.deepEqual(
      model.horizons.map((item) => item.horizonMonths),
      [...SECTOR_FORWARD_HORIZONS],
    );
    for (const horizon of model.horizons) {
      assert.ok(horizon.test.periods >= 24, `${model.id}/${horizon.horizonMonths} test sample too short`);
      assert.ok((horizon.test.averageSectorCount ?? 0) >= 6);
    }
    assert.ok(model.testPortfolio.periods >= 24, `${model.id} portfolio test sample too short`);
  }
  assert.equal(report.selectedByHorizon.length, 3);
  for (const selection of report.selectedByHorizon) {
    assert.notEqual(selection.modelId, "unconditional");
    assert.equal(typeof selection.selectionPassed, "boolean");
    assert.ok(selection.test.periods >= 24);
  }
  assert.ok(report.current, "current research signal missing");
  assert.equal(report.current?.status, "researchOnly");
  for (const horizon of report.current?.horizons ?? []) {
    assert.equal(typeof horizon.selectionPassed, "boolean");
    assert.ok(horizon.rankings.length >= 6);
    horizon.rankings.forEach((row, index) => assert.equal(row.rank, index + 1));
    for (let index = 1; index < horizon.rankings.length; index += 1) {
      assert.ok(horizon.rankings[index - 1]!.score >= horizon.rankings[index]!.score);
    }
  }
  assertFiniteTree(report);

  const payloadKb = Buffer.byteLength(JSON.stringify(report), "utf8") / 1024;
  assert.ok(payloadKb < 250, `payload ${payloadKb.toFixed(1)}KB exceeds 250KB`);
  assert.ok(warmMs < 200, `warm query ${warmMs.toFixed(1)}ms exceeds 200ms`);

  console.log(JSON.stringify({
    status: "passed",
    sample: report.sample,
    selectedByHorizon: report.selectedByHorizon.map((item) => ({
      horizonMonths: item.horizonMonths,
      modelId: item.modelId,
      selectionPassed: item.selectionPassed,
      validationMeanIc: round(item.validationMeanIc),
      testMeanIc: round(item.test.meanIc),
      testIc95: [round(item.test.icCiLow), round(item.test.icCiHigh)],
      testHitRate: round(item.test.hitRate),
      testTop3Excess: round(item.test.meanTop3Outcome),
      verdict: item.verdict,
    })),
    modelComparison: report.models.flatMap((model) => model.horizons.map((item) => ({
      modelId: model.id,
      horizonMonths: item.horizonMonths,
      validationMeanIc: round(item.validation.meanIc),
      testMeanIc: round(item.test.meanIc),
      testHitRate: round(item.test.hitRate),
      testTop3Excess: round(item.test.meanTop3Outcome),
    }))),
    fundamentalOutlook: report.fundamentalOutlook.map((item) => ({
      horizonMonths: item.horizonMonths,
      testMeanIc: round(item.regimeOnly.test.meanIc),
      testIc95: [round(item.regimeOnly.test.icCiLow), round(item.regimeOnly.test.icCiHigh)],
      verdict: item.verdict,
    })),
    portfolio2020: report.models.map((model) => ({
      modelId: model.id,
      annualizedExcess: round(model.testPortfolio.annualizedExcess),
      maxDrawdown: round(model.testPortfolio.maxDrawdown),
      turnover: round(model.testPortfolio.averageMonthlyTurnover),
    })),
    current: report.current,
    overallVerdict: report.overallVerdict,
    performance: {
      coldMs: Number(coldMs.toFixed(1)),
      warmMs: Number(warmMs.toFixed(1)),
      payloadKb: Number(payloadKb.toFixed(1)),
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
