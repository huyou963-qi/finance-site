import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractAnnualFundamentals } from "./secFundamentals";

describe("secFundamentals", () => {
  it("extractAnnualFundamentals computes YoY and margins", () => {
    const facts = {
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: {
              USD: [
                { end: "2023-09-30", val: 100, form: "10-K", fp: "FY" },
                { end: "2024-09-28", val: 120, form: "10-K", fp: "FY" },
              ],
            },
          },
          EarningsPerShareDiluted: {
            units: {
              "USD/shares": [
                { end: "2023-09-30", val: 5, form: "10-K", fp: "FY" },
                { end: "2024-09-28", val: 6, form: "10-K", fp: "FY" },
              ],
            },
          },
          GrossProfit: {
            units: {
              USD: [{ end: "2024-09-28", val: 48, form: "10-K", fp: "FY" }],
            },
          },
          OperatingIncomeLoss: {
            units: {
              USD: [{ end: "2024-09-28", val: 36, form: "10-K", fp: "FY" }],
            },
          },
        },
      },
    };

    const snap = extractAnnualFundamentals(facts);
    assert.ok(snap);
    assert.equal(snap!.period, "2024FY");
    assert.equal(snap!.revenue, 120);
    assert.ok(Math.abs((snap!.revenueYoY ?? 0) - 0.2) < 1e-9);
    assert.equal(snap!.eps, 6);
    assert.ok(Math.abs((snap!.epsYoY ?? 0) - 0.2) < 1e-9);
    assert.ok(Math.abs((snap!.grossMargin ?? 0) - 0.4) < 1e-9);
    assert.ok(Math.abs((snap!.opMargin ?? 0) - 0.3) < 1e-9);
  });
});
