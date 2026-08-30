import assert from "node:assert/strict";
import test from "node:test";
import { buildInvestmentCaseFile, INVESTMENT_CASE_FILE_SCHEMA, investmentCaseFilename } from "./investmentCaseFile";

test("buildInvestmentCaseFile produces a versioned, chronological AI handoff", () => {
  const now = new Date("2026-08-30T12:00:00.000Z");
  const file = buildInvestmentCaseFile({
    id: "case-1",
    symbol: "CRCL",
    title: "Circle 建仓案例",
    style: "event",
    status: "holding",
    horizon: "6-12 months",
    coreThesis: "稳定币采用率提升",
    nextReviewAt: null,
    closedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: now,
    researchVersions: [{ version: 2 }, { version: 1 }],
    catalysts: [],
    tradePlan: { entryLow: 80 },
    actions: [
      { occurredAt: "2026-08-20T00:00:00.000Z", actionType: "TRIM" },
      { occurredAt: "2026-08-10T00:00:00.000Z", actionType: "BUY" },
    ],
    reviews: [],
    summary: { quantity: 10 },
  }, now);

  assert.equal(file.schema, INVESTMENT_CASE_FILE_SCHEMA);
  assert.equal(file.dataCutoff, now.toISOString());
  assert.match(file.source.evidenceSha256, /^[a-f0-9]{64}$/);
  const evidence = file.primaryEvidence as { researchVersions: { version: number }[]; actions: { actionType: string }[] };
  assert.deepEqual(evidence.researchVersions.map((item) => item.version), [1, 2]);
  assert.deepEqual(evidence.actions.map((item) => item.actionType), ["BUY", "TRIM"]);
  assert.match(file.analysisRequest.outputFormat, /Markdown/);
});

test("investmentCaseFilename is portable", () => {
  assert.equal(
    investmentCaseFilename("CRCL", new Date("2026-08-30T12:34:56.789Z")),
    "CRCL-investment-case-2026-08-30T12-34-56-789Z.json",
  );
});
