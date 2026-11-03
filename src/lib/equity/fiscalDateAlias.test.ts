import { test } from "node:test";
import assert from "node:assert/strict";
import { fiscalDateAliasProof } from "./fiscalDateAlias";
import type { SecQuarterlyFundamentals } from "./secFundamentals";

test("Waters历史月末别名须两科目、原申报真实日期、后续一年以上的等值比较表", () => {
  const points = [
    { start: "2017-01-01", end: "2017-04-01", val: 10, accn: "original", filed: "2017-05-05", form: "10-Q" },
    { start: "2017-01-01", end: "2017-03-31", val: 10, accn: "comparison", filed: "2019-02-26", form: "10-K" },
  ];
  const facts = { cik: 1000697, facts: { "us-gaap": {
    IncomeTaxExpenseBenefit: { units: { USD: points } },
    CostOfGoodsAndServicesSold: { units: { USD: points.map(p => ({ ...p, val: 20 })) } },
  } } };
  const old = { period: "2017Q1", fiscalDate: "2017-03-31", revenue: 100 };
  const incoming = { period: "2017Q1", fiscalDate: "2017-04-01", revenue: 100, netIncome: 20, ocf: 30, capex: 2 } as SecQuarterlyFundamentals;
  assert.equal(fiscalDateAliasProof(facts, old, incoming)?.to, "2017-04-01");
  assert.equal(fiscalDateAliasProof({ ...facts, cik: 999 }, old, incoming), null);
  assert.equal(fiscalDateAliasProof(facts, { ...old, revenue: 101 }, incoming), null);
  assert.equal(fiscalDateAliasProof(facts, { ...old, ocf: 31 }, incoming), null);
  assert.equal(fiscalDateAliasProof(facts, { ...old, capex: 0 }, incoming), null);
  assert.equal(fiscalDateAliasProof({ ...facts, facts: { "us-gaap": { IncomeTaxExpenseBenefit: facts.facts["us-gaap"].IncomeTaxExpenseBenefit } } }, old, incoming), null);
  const recent = points.map(p => ({ ...p, filed: "2017-05-05" }));
  assert.equal(fiscalDateAliasProof({ ...facts, facts: { "us-gaap": { IncomeTaxExpenseBenefit: { units: { USD: recent } }, CostOfGoodsAndServicesSold: { units: { USD: recent } } } } }, old, incoming), null);
});
