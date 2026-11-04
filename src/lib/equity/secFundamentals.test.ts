import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractAnnualFundamentals, extractQuarterlyFundamentals } from "./secFundamentals";

describe("secFundamentals", () => {
  it("uses the verified utility operating total even when contract revenue is larger or fresher", () => {
    const point=(start:string,end:string,val:number)=>({start,end,val,filed:'2026-10-30',form:'10-Q',accn:'0000788784-26-000001'});
    const facts={cik:788784,facts:{'us-gaap':{
      Revenues:{units:{USD:[point('2026-01-01','2026-03-31',3848),point('2026-04-01','2026-06-30',2554)]}},
      RevenueFromContractWithCustomerIncludingAssessedTax:{units:{USD:[point('2026-01-01','2026-03-31',4157),point('2026-04-01','2026-06-30',2728),point('2026-07-01','2026-09-30',3233)]}},
    }}};
    const rows=extractQuarterlyFundamentals(facts,{maxQuarters:20});
    assert.equal(rows.find(r=>r.period==='2026Q1')?.revenue,3848);
    assert.equal(rows.find(r=>r.period==='2026Q2')?.revenue,2554);
    assert.equal(rows.find(r=>r.period==='2026Q3')?.revenue??null,null,'a missing total cannot be replaced with a contract component');
    const legacy={cik:4904,facts:{'us-gaap':{RegulatedAndUnregulatedOperatingRevenue:{units:{USD:[point('2026-01-01','2026-03-31',6020)]}}}}};
    assert.equal(extractQuarterlyFundamentals(legacy)[0]?.revenue,6020);
  });
  it("uses the same complete utility total for annual revenue and margins",()=>{
    const annual=(val:number)=>({start:'2025-01-01',end:'2025-12-31',val,filed:'2026-02-20',form:'10-K',fp:'FY'});
    const facts={cik:788784,facts:{'us-gaap':{
      Revenues:{units:{USD:[annual(100)]}},
      RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:[annual(140)]}},
      OperatingIncomeLoss:{units:{USD:[annual(20)]}},
    }}};
    const row=extractAnnualFundamentals(facts);assert.equal(row?.revenue,100);assert.equal(row?.opMargin,.2);
  });
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
