import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUsFiscalViews,
  fiscalDailyTransactions,
  fiscalRolling12,
  type FiscalViewInput,
} from "./usFiscalViews";
import { US_FISCAL_VIEW_IDS } from "./usFiscalViewTypes";

function fixture(): FiscalViewInput {
  const series: FiscalViewInput["series"] = {};
  for (const [id, values] of Object.entries({
    FDHBFRBN: [10, 12, 14, 16, 20, 22],
    FDHBFIN: [30, 32, 34, 36, 40],
    FDHBPIN: [100, 110, 120, 130, 140, 150],
  }))
    series[`fred:${id}`] = values.map((value, i) => ({
      date: `${2024 + Math.floor(i / 4)}-${String((i % 4) * 3 + 1).padStart(2, "0")}-01`,
      value,
    }));
  for (const [name, value] of Object.entries({
    receipts: 100,
    outlays: 130,
    deficit: 30,
  }))
    series[`treasury_mts_m01_${name}`] = Array.from({ length: 36 }, (_, i) => ({
      date: new Date(Date.UTC(2023 + Math.floor(i / 12), i % 12, 28))
        .toISOString()
        .slice(0, 10),
      value: value * 1e9,
    }));
  series.treasury_mts_m09_outlay_interest =
    series.treasury_mts_m01_receipts!.map((r) => ({ ...r, value: 10e9 }));
  for (const name of ["receipts", "outlays", "deficit"])
    series[`treasury_mts_m01_${name}_fytd`] = series[
      `treasury_mts_m01_${name}`
    ]!.map((r) => ({
      ...r,
      value: r.value * (((Number(r.date.slice(5, 7)) + 2) % 12) + 1),
    }));
  const mspd = {
    date: "2025-12-31",
    rows: [
      {
        record_date: "2025-12-31",
        security_type_desc: "Marketable",
        security_class1_desc: "Bills Maturity Value",
        security_class2_desc: "912795AA1",
        maturity_date: "2026-01-15",
        issue_date: "2025-10-15",
        outstanding_amt: "1000000",
      },
    ],
  };
  return {
    series,
    mspd,
    auctions: [
      {
        record_date: "2025-12-15",
        issue_date: "2025-12-15",
        cusip: "auction1",
        security_type: "Bill",
        total_accepted: "1000000000",
      },
      {
        record_date: "2026-02-15",
        issue_date: "2026-02-15",
        cusip: "future",
        security_type: "Note",
        total_accepted: "9000000000",
      },
    ],
    today: "2026-01-21",
  };
}
test("fiscal TTM requires twelve consecutive calendar months and does not bridge a missing month", () => {
  const months = new Map(
    Array.from(
      { length: 13 },
      (_, i) =>
        [new Date(Date.UTC(2024, i, 1)).toISOString().slice(0, 7), 1] as const,
    ),
  );
  assert.equal(fiscalRolling12(months).get("2024-12"), 12);
  months.delete("2024-07");
  assert.equal(fiscalRolling12(months).get("2025-01"), null);
});
test("DTS monthly amounts reject a missing category on a shared day and omit the open month", () => {
  const out = fiscalDailyTransactions(
    {
      a: [
        { date: "2025-12-01", value: 1 },
        { date: "2025-12-02", value: 2 },
        { date: "2026-01-02", value: 3 },
      ],
      b: [{ date: "2025-12-01", value: 4 }],
    },
    ["a", "b"],
    "2026-01-21",
  );
  assert.equal(out[0]!.get("2025-12"), null);
  assert.equal(out[1]!.get("2025-12"), null);
  assert.equal(out[0]!.has("2026-01"), false);
});
test("all 18 views preserve common-quarter holders, exact four-quarter changes and deficit identity", () => {
  const { views } = buildUsFiscalViews(fixture());
  assert.deepEqual(Object.keys(views), [...US_FISCAL_VIEW_IDS]);
  assert.equal(views.A5.asOf, "2025Q1");
  assert.equal(views.A5.series[2]!.data.at(-1), 100);
  assert.deepEqual(
    views.A6.series.map((s) => s.data.at(-1)),
    [10, 10, 30],
  );
  for (const [i, expected] of [240, 120, 360].entries())
    assert.ok(Math.abs(views.B3.series[i]!.data.at(-1)! - expected) < 1e-9);
  assert.equal(views.C3.asOf, "2025-12");
  assert.equal(views.C3.series[0]!.data.at(-1), 1);
  assert.equal(views.C4.categories.length, 12);
  assert.equal(views.C4.series[0]!.data[0], 1000);
});
test("missing actual auction results remain null and never fall back to planned offering", () => {
  const input = fixture();
  input.auctions.push({
    record_date: "2025-12-16",
    issue_date: "2025-12-16",
    cusip: "missing",
    security_type: "Note",
    total_accepted: null,
    offering_amt: "999",
  });
  const { views } = buildUsFiscalViews(input);
  assert.equal(views.C3.series[0]!.data.at(-1), null);
});
