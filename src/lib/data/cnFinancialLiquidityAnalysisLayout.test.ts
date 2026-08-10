import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILTIN_CN_FINANCIAL_LIQUIDITY_CREDIT_TEMPLATE,
  BUILTIN_CN_FINANCIAL_LIQUIDITY_FUNDING_TEMPLATE,
  BUILTIN_CN_FINANCIAL_LIQUIDITY_TEMPLATES,
} from "./cnFinancialLiquidityAnalysisLayout";

test("registers two four-slot China financial-liquidity templates", () => {
  assert.deepEqual(
    BUILTIN_CN_FINANCIAL_LIQUIDITY_TEMPLATES.map((template) => template.id),
    [
      "builtin-cn-financial-liquidity-funding",
      "builtin-cn-financial-liquidity-credit",
    ],
  );
  for (const template of BUILTIN_CN_FINANCIAL_LIQUIDITY_TEMPLATES) {
    assert.equal(template.layoutMode, 4);
    assert.equal(template.folderId, "folder-builtin-cn-financial-liquidity");
    assert.deepEqual(Object.keys(template.chartIntroNotes ?? {}).sort(), ["0", "1", "2", "3"]);
    const occupied = new Set(
      Object.values(template.slotAssignment).filter((slot): slot is number => slot !== null),
    );
    assert.deepEqual([...occupied].sort(), [0, 1, 2, 3]);
  }
});

test("keeps funding spreads and credit shares as display-layer derivations", () => {
  const funding = new Map(
    (BUILTIN_CN_FINANCIAL_LIQUIDITY_FUNDING_TEMPLATE.derivedCalcs ?? []).map((calc) => [
      calc.id,
      calc,
    ]),
  );
  assert.equal(funding.get("cn-financial-unsecured-secured-spread")?.op, "sub");
  assert.equal(funding.get("cn-financial-m1-m2-gap")?.op, "sub");

  const credit = new Map(
    (BUILTIN_CN_FINANCIAL_LIQUIDITY_CREDIT_TEMPLATE.derivedCalcs ?? []).map((calc) => [
      calc.id,
      calc,
    ]),
  );
  assert.equal(credit.get("cn-financial-loan-deposit-growth-gap")?.op, "sub");
  for (const id of [
    "cn-financial-tsf-rmb-loan-share",
    "cn-financial-tsf-government-bond-share",
    "cn-financial-tsf-corporate-bond-share",
    "cn-financial-tsf-equity-share",
  ]) {
    assert.equal(credit.get(id)?.op, "ratio");
    assert.equal(credit.get(id)?.scale, 100);
  }
});
