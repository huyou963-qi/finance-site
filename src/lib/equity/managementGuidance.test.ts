import assert from "node:assert/strict";
import test from "node:test";
import { buildGuidanceSeries, buildGuidanceDeliveries, compareGuidanceActual, extractManagementGuidance, formatGuidanceValue, parseGuidanceTarget, parseGuidanceValue, type GuidanceVersion } from "./managementGuidance";

const url = "https://www.sec.gov/Archives/edgar/data/123/456/ex99.htm";
const parse = (text: string) => extractManagementGuidance([{ url, text }]);
function version(text: string, day = "2026-08-05", accession = day): GuidanceVersion {
  return { ...parse(text)[0], id: accession, accession, disclosedOn: day, dateBasis: "filing" };
}
test("fiscal quarter labels never become calendar dates; explicit quarter end is preserved", () => {
  assert.deepEqual(parseGuidanceTarget("Outlook for the fourth quarter of fiscal 2027"), { key: "FY2027Q4", label: "FY2027 Q4", horizon: "quarter", endDate: null });
  assert.equal(parseGuidanceTarget("quarter ending September 30, 2026")?.endDate, "2026-09-30");
  assert.equal(parseGuidanceTarget("quarter ending February 30, 2026"), null);
  assert.equal(parseGuidanceTarget("Q3 FY2027 Outlook")?.key, "FY2027Q3");
});
test("outlook heading scopes revenue, margin and annual capex separately", () => {
  const rows = parse("Outlook for the third quarter of fiscal 2026\nGAAP revenue is expected to be $30 to $32 billion.\nGAAP gross margin is expected to be 70% to 71%.\nWe expect capital expenditures of $8 to $9 billion for fiscal 2026.");
  assert.equal(rows.length, 3);
  assert.equal(rows[0].value?.low, 30e9);
  assert.equal(rows[0].value?.high, 32e9);
  assert.equal(rows[1].value?.high, 71);
  assert.equal(rows[2].target.horizon, "year");
});
test("bullet-style outlook keeps scope through assumptions and shared GAAP margins, then stops at highlights", () => {
  const rows = parse("Outlook\nCompany outlook for the third quarter of fiscal 2027 is as follows:\n•Revenue is expected to be $108.0 billion, plus or minus 2%. We do not assume regional revenue in the outlook.\n•GAAP and non-GAAP gross margins are expected to be 74.0%, plus or minus 50 basis points.\n•GAAP and non-GAAP operating expenses are expected to be approximately $9.2 billion and $9.0 billion, respectively.\nHighlights\nRevenue was $96 billion.");
  assert.equal(rows.length, 5);
  assert.equal(rows[0].status, "active");
  assert.equal(rows[0].target.key, "FY2027Q3");
  assert.equal(rows[1].value?.low, 73.5);
  assert.equal(rows[2].value?.high, 74.5);
  assert.equal(rows[3].value?.point, 9.2e9);
  assert.equal(rows[4].value?.point, 9e9);
});
test("dollar ranges and absolute versus relative margin tolerances", () => {
  assert.equal(parseGuidanceValue("is expected to be $30 billion, plus or minus 2%.", "revenue")?.low, 29.4e9);
  assert.equal(parseGuidanceValue("is expected to be 70%, plus or minus 50 basis points.", "grossMargin")?.low, 69.5);
  assert.equal(parseGuidanceValue("is expected to be 70%, plus or minus 1%.", "grossMargin")?.high, 71);
  assert.equal(parseGuidanceValue("of $1.20 to $1.30", "eps")?.high, 1.3);
});
test("lower bound has no artificial midpoint; strict bounds remain strict", () => {
  const row = version("We expect free cash flow of at least $12 billion for fiscal 2026.");
  assert.equal(row.value?.qualifier, "atLeast");
  assert.equal(row.value?.point, null);
  assert.match(formatGuidanceValue(row.value), /≥12B/);
  assert.equal(parseGuidanceValue("to exceed $12 billion", "fcf")?.qualifier, "above");
});
test("growth, unsupported currencies, missing scale, negative EPS and mixed GAAP remain unparsed", () => {
  for (const text of ["growth of 30%", "of €30 billion", "of $30", "of CAD $30 billion"]) assert.equal(parseGuidanceValue(text, "revenue"), null);
  assert.equal(parseGuidanceValue("of -$0.50", "eps"), null);
  const rows = parse("Q3 FY2027 Outlook\nGAAP and non-GAAP gross margins are expected to be 74.8% and 75.0%, respectively.");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].basis, "gaap");
  assert.equal(rows[1].basis, "nonGaap");
  assert.equal(rows[0].value?.point, 74.8);
  assert.equal(rows[1].value?.point, 75);
});
test("unknown period retains evidence, and safe harbor / reconciliations end the scope", () => {
  const rows = parse("We expect revenue of $30 billion next quarter.\nForward-looking statements\nRevenue was $20 billion.");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].target.horizon, "unknown");
  assert.equal(rows[0].value, null);
  assert.equal(parse("Outlook for fiscal 2026\nReconciliation\nRevenue | $30 billion").length, 0);
});
test("only same target and accounting basis have adjustment deltas", () => {
  const previous = version("We expect GAAP revenue of $28 to $30 billion for Q3 FY2026.", "2026-05-05");
  const current = version("We expect GAAP revenue of $30 to $32 billion for Q3 FY2026.");
  const series = buildGuidanceSeries([previous, current]);
  assert.equal(series.length, 1);
  assert.ok(Math.abs(series[0].change!.delta - 6.89655) < .001);
  assert.equal(buildGuidanceSeries([previous, version("We expect GAAP revenue of $32 billion for Q4 FY2026.")]).length, 2);
  assert.equal(buildGuidanceSeries([previous, version("We expect non-GAAP revenue of $32 billion for Q3 FY2026.")]).length, 2);
});
test("unparsed newer update supersedes old value, withdrawals deactivate earlier bases", () => {
  const prior = version("We expect GAAP revenue of $30 billion for Q3 FY2026.", "2026-05-05");
  const unknown = version("We expect GAAP revenue growth of 5% for Q3 FY2026.");
  assert.equal(buildGuidanceSeries([prior, unknown])[0].latest.status, "unparsed");
  const withdrawal = version("We withdraw our revenue guidance for Q3 FY2026.");
  assert.ok(buildGuidanceSeries([prior, withdrawal]).every(g => g.latest.status === "withdrawn"));
});
test("conflicting numbers in same filing never arbitrarily select a numeric value", () => {
  const a = version("We expect GAAP revenue of $30 billion for Q3 FY2026.");
  const b = version("We expect GAAP revenue of $32 billion for Q3 FY2026.");
  assert.equal(buildGuidanceSeries([a, b])[0].latest.status, "unparsed");
  assert.equal(buildGuidanceSeries([a, { ...b, accession: "other", id: "other" }])[0].latest.status, "unparsed");
});

test("one paragraph can contain quarterly expense amounts followed by a separate annual growth target", () => {
  const records = parse("Outlook for the third quarter of fiscal 2026\nGAAP and non-GAAP operating expenses are expected to be approximately $5.9 billion and $4.2 billion, respectively. Full year fiscal 2026 operating expense growth is expected to be in the high-30% range.");
  assert.equal(records[0].target.key, "FY2026Q3");
  assert.equal(records[0].value?.point, 5.9e9);
  assert.equal(records[1].value?.point, 4.2e9);
});
test("a repeated centre table and incomplete same-announcement row do not erase a complete outlook range", () => {
  const records = parse("Outlook for the third quarter of fiscal 2026\nGAAP gross margin is expected to be 73.3%, plus or minus 50 basis points.\nGAAP gross margin | | 73.3 | % |\nGAAP gross margin | see notes");
  const versions = records.map((r, i) => ({ ...r, id: String(i), accession: "same", disclosedOn: "2026-05-05", dateBasis: "filing" as const }));
  const series = buildGuidanceSeries(versions);
  assert.equal(series[0].latest.status, "active");
  assert.equal(series[0].latest.value?.qualifier, "range");
  const later = { ...versions[2], accession: "later", disclosedOn: "2026-06-05" };
  assert.equal(buildGuidanceSeries([...versions, later])[0].latest.status, "unparsed");
});
test("delivery requires exact end, period, unit and basis; no backfilled guidance", () => {
  const row = version("We expect GAAP revenue of $24 to $26 billion for the quarter ending September 30, 2026.");
  const actual = { endDate: "2026-09-30", horizon: "quarter" as const, metric: "revenue" as const, basis: "gaap" as const, value: 27.6e9, unit: "USD" as const, reportedOn: "2026-11-05", sourceUrl: url };
  assert.equal(compareGuidanceActual(row, actual)?.outcome, "above");
  assert.equal(compareGuidanceActual(row, { ...actual, basis: "nonGaap" }), null);
  assert.equal(compareGuidanceActual(row, { ...actual, endDate: "2026-12-31" }), null);
  assert.equal(compareGuidanceActual(row, { ...actual, horizon: "year" }), null);
  assert.equal(compareGuidanceActual({ ...row, disclosedOn: "2026-10-01" }, actual), null);
  assert.equal(compareGuidanceActual({ ...row, target: { ...row.target, endDate: null } }, actual), null);
});

test("delivery never revives superseded, conflicting or withdrawn guidance; ignores later hindsight updates", () => {
  const a = version("We expect GAAP revenue of $24 to $26 billion for the quarter ending September 30, 2026.", "2026-05-05", "a");
  const b = version("We expect GAAP revenue of $28 to $30 billion for the quarter ending September 30, 2026.", "2026-08-05", "b");
  const actual = { endDate: "2026-09-30", horizon: "quarter" as const, metric: "revenue" as const, basis: "gaap" as const, value: 27.6e9, unit: "USD" as const, reportedOn: "2026-11-05", sourceUrl: url };
  assert.equal(buildGuidanceDeliveries([a, b], [actual])[0].outcome, "below");
  assert.equal(buildGuidanceDeliveries([a, b, { ...b, value: { ...b.value!, low: 29e9 } }], [actual]).length, 0);
  const withdrawal = version("We withdraw revenue guidance for the quarter ending September 30, 2026.", "2026-09-01", "c");
  assert.equal(buildGuidanceDeliveries([a, b, withdrawal], [actual]).length, 0);
  assert.equal(buildGuidanceDeliveries([a, b, { ...withdrawal, disclosedOn: "2026-10-05" }], [actual])[0].outcome, "below");
});
