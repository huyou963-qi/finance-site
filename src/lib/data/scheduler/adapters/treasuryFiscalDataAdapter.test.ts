import assert from "node:assert/strict";
import test from "node:test";
import { fetchTreasuryFiscalIncremental } from "./treasuryFiscalDataAdapter";
import { selectMts1FytdRow } from "../treasuryFiscalData/client";

const report = (date = "2026-08-31", fy = "2026") => [
  { record_date: date, classification_id: "prior", classification_desc: `FY ${+fy - 1}`, record_type_cd: "SL", data_type_cd: "S", record_fiscal_year: fy },
  { record_date: date, classification_id: "current", classification_desc: `FY ${fy}`, record_type_cd: "SL", data_type_cd: "S", record_fiscal_year: fy },
  { record_date: date, parent_id: "prior", classification_desc: "Year-to-Date", record_type_cd: "SL", data_type_cd: "T", record_fiscal_year: fy, current_month_gross_rcpt_amt: "5234616472030.91" },
  { record_date: date, parent_id: "current", classification_desc: "Year-to-Date", record_type_cd: "SL", data_type_cd: "T", record_fiscal_year: fy, current_month_gross_rcpt_amt: "4845452239722.57", current_month_gross_outly_amt: "6811043257196.10", current_month_dfct_sur_amt: "1965591017473.53" },
];

test("FYTD chooses current fiscal-year parent, not shared record_fiscal_year", () => {
  assert.equal(selectMts1FytdRow(report(), "2026-08-31").parent_id, "current");
  assert.equal(selectMts1FytdRow(report("2026-10-31", "2027"), "2026-10-31").parent_id, "current");
});

test("FYTD fails closed on missing or ambiguous original subtotal", () => {
  const rows = report();
  assert.throws(() => selectMts1FytdRow(rows.slice(0, 3), "2026-08-31"), /累计行不唯一/);
  assert.throws(() => selectMts1FytdRow([...rows, rows[3]!], "2026-08-31"), /累计行不唯一/);
  assert.throws(() => selectMts1FytdRow(rows.filter((r) => r.classification_id !== "current"), "2026-08-31"), /父行不唯一/);
});

test("FYTD incremental fetch reads original revised totals without October history", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    const query = new URL(String(url)).searchParams;
    assert.equal(query.getAll("filter").some((f) => f.includes("record_type_cd") || f.includes("data_type_cd")), false);
    return new Response(JSON.stringify({ data: report(), meta: { "total-pages": 1 } }));
  });
  for (const [key, expected] of [["receipts", 4845452239722.57], ["outlays", 6811043257196.10], ["deficit", 1965591017473.53]] as const) {
    const result = await fetchTreasuryFiscalIncremental(`mts1:${key}_fytd`, "2026-08-01");
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0]!.value, expected);
    assert.equal(result.sourceLatestObsDate?.toISOString().slice(0, 10), "2026-08-31");
  }
});
