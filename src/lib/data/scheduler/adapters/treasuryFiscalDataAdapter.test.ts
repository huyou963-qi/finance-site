import assert from "node:assert/strict";
import test from "node:test";
import { fetchTreasuryFiscalIncremental } from "./treasuryFiscalDataAdapter";
import { selectMts1FytdRow, selectMts1FyMonthRow } from "../treasuryFiscalData/client";
import { rowsToTgaClosingBalance } from "./treasuryFiscalDataAdapter";

const report = (date = "2026-08-31", fy = "2026"): Array<Record<string, string | null>> => [
  { record_date: date, classification_id: "prior", classification_desc: `FY ${+fy - 1}`, record_type_cd: "SL", data_type_cd: "S", record_fiscal_year: fy },
  { record_date: date, classification_id: "current", classification_desc: `FY ${fy}`, record_type_cd: "SL", data_type_cd: "S", record_fiscal_year: fy },
  { record_date: date, parent_id: "prior", classification_desc: "Year-to-Date", record_type_cd: "SL", data_type_cd: "T", record_fiscal_year: fy, current_month_gross_rcpt_amt: "5234616472030.91" },
  { record_date: date, parent_id: "current", classification_desc: "Year-to-Date", record_type_cd: "SL", data_type_cd: "T", record_fiscal_year: fy, current_month_gross_rcpt_amt: "4845452239722.57", current_month_gross_outly_amt: "6811043257196.10", current_month_dfct_sur_amt: "1965591017473.53" },
];

test("FYTD chooses current fiscal-year parent, not shared record_fiscal_year", () => {
  assert.equal(selectMts1FytdRow(report(), "2026-08-31").parent_id, "current");
  assert.equal(selectMts1FytdRow(report("2026-10-31", "2027"), "2026-10-31").parent_id, "current");
});

test("monthly October row belongs to current FY parent, never the prior FY October comparison",()=>{
  const rows=[...report("2026-10-31","2027"),
    {record_date:"2026-10-31",parent_id:"prior",record_type_cd:"MTH",data_type_cd:"D",record_fiscal_year:"2027",classification_desc:"October",line_code_nbr:"20",current_month_gross_rcpt_amt:"404371348973.70"},
    {record_date:"2026-10-31",parent_id:"current",record_type_cd:"MTH",data_type_cd:"D",record_fiscal_year:"2027",classification_desc:"October",line_code_nbr:"160",current_month_gross_rcpt_amt:"368940118602.77"},
  ];
  assert.equal(selectMts1FyMonthRow(rows,"2026-10-31")!.current_month_gross_rcpt_amt,"368940118602.77");
});

test("TGA history uses native closing columns across the official table redesign",()=>{
  const points=rowsToTgaClosingBalance([
    {record_date:"2020-01-02",account_type:"Federal Reserve Account",open_today_bal:"403853",close_today_bal:"382335"},
    {record_date:"2022-01-03",account_type:"Treasury General Account (TGA)",open_today_bal:"406108",close_today_bal:"366304"},
    {record_date:"2026-11-19",account_type:"Treasury General Account (TGA) Closing Balance",open_today_bal:"891223",close_today_bal:"null"},
  ]);
  assert.deepEqual(points.map(p=>p.value),[382335,366304,891223]);
});

test("native fields preserve official gaps and send all API predicates in one filter",async(t)=>{
  t.mock.method(globalThis,"fetch",async(url:string|URL|Request)=>{
    const query=new URL(String(url)).searchParams;
    assert.equal(query.getAll("filter").length,1);
    assert.match(query.get("filter")!,/line_code_nbr:eq:9624/);
    return new Response(JSON.stringify({data:[
      {record_date:"2026-09-30",line_code_nbr:"9624",record_type_cd:"GL",current_month_net_txn_amt:"null"},
      {record_date:"2026-10-31",line_code_nbr:"9624",record_type_cd:"GL",current_month_net_txn_amt:"123"},
    ],meta:{"total-pages":1}}));
  });
  const result=await fetchTreasuryFiscalIncremental("treasury_mts_m06_other_budget","2026-09-01");
  assert.deepEqual(result.points.map(p=>p.value),[123]);assert.equal(result.skippedInvalid,1);
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
