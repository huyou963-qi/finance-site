import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import fixture from "./fixtures/hhdc-2026q3-excerpt.json";
import { discoverHhdcWorkbook, parseHhdcQuarter, parseHhdcWorkbook } from "./parser";
import { NYFED_HHDC_SERIES, CONSUMER_PRESSURE_FRED } from "./catalog";
import { resolveGlobalCatalogPlacement } from "../../globalCatalogTaxonomy";
import { placeConsumerPressureKeys } from "./layout";
import { RELEASE_PACKAGE_CATALOG, instrumentMatchesPackageMember } from "../releasePackageCatalog";
import { fredBootstrapObservationStart } from "../adapters/fredAdapter";

function workbook() {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(fixture)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return wb;
}
test("official 2026Q3 excerpt preserves nine native series and units", () => {
  const wb = workbook();
  for (const def of NYFED_HHDC_SERIES) {
    const points = parseHhdcWorkbook(wb, def.code);
    assert.equal(points[0].obsDate.toISOString().slice(0, 10), "2003-01-01");
    assert.equal(points.at(-1)?.obsDate.toISOString().slice(0, 10), "2026-07-01");
  }
  assert.equal(parseHhdcWorkbook(wb, "nyfed_hhdc_credit_card_balance").at(-1)?.value, 1.285);
  assert.equal(parseHhdcWorkbook(wb, "nyfed_hhdc_auto_delinquent_90").at(-1)?.value, 5.66);
  assert.equal(parseHhdcWorkbook(wb, "nyfed_hhdc_auto_new_delinquent_90").at(-1)?.value, 3.02);
});
test("quarter normalization handles 1999, 2000, four-digit years and Excel quarter-end dates", () => {
  assert.equal(parseHhdcQuarter("99:Q4")?.toISOString().slice(0, 10), "1999-10-01");
  assert.equal(parseHhdcQuarter("00:Q1")?.toISOString().slice(0, 10), "2000-01-01");
  assert.equal(parseHhdcQuarter("2026:Q3")?.toISOString().slice(0, 10), "2026-07-01");
  assert.equal(parseHhdcQuarter(45352)?.toISOString().slice(0, 10), "2024-01-01");
  assert.equal(parseHhdcQuarter("26:Q5"), null);
});
test("missing cells stay missing while genuine zero survives", () => {
  const wb = workbook();
  const sheet = wb.Sheets["Page 12 Data"];
  sheet.D5.v = 0;
  delete sheet.D6;
  const points = parseHhdcWorkbook(wb, "nyfed_hhdc_auto_delinquent_90");
  assert.equal(points[0].value, 0);
  assert.equal(points.some(p => p.obsDate.toISOString().startsWith("2003-04")), false);
});
test("source unit or title drift fails closed", () => {
  const wb = workbook();
  wb.Sheets["Page 12 Data"].A2.v = "Fraction";
  assert.throws(() => parseHhdcWorkbook(wb, "nyfed_hhdc_auto_delinquent_90"), /unit changed/);
  delete wb.Sheets["Page 10 Data"];
  wb.SheetNames = wb.SheetNames.filter(n => n !== "Page 10 Data");
  assert.throws(() => parseHhdcWorkbook(wb, "nyfed_hhdc_credit_card_balance"), /title missing/);
});
test("duplicate quarters fail rather than silently overwriting observations", () => {
  const wb = workbook();
  wb.Sheets["Page 12 Data"].A6.v = "03:Q1";
  assert.throws(() => parseHhdcWorkbook(wb, "nyfed_hhdc_auto_delinquent_90"), /duplicate quarter/);
});
test("discovers the newest official download across year boundaries without a fixed report URL", () => {
  const base = "/medialibrary/interactives/householdcredit/data/xls/HHD_C_Report_";
  assert.equal(discoverHhdcWorkbook(`<a href='${base}2026Q4'>old</a><a href='${base}2027Q1.xlsx'>new</a>`), `https://www.newyorkfed.org${base}2027Q1.xlsx`);
  assert.throws(() => discoverHhdcWorkbook("<html>login</html>"), /link missing/);
});
test("all new keys have explicit business subgroups", () => {
  for (const row of CONSUMER_PRESSURE_FRED) {
    const placement = resolveGlobalCatalogPlacement({ key: `fred:${row.fredId}`, countryCode: "US", label: row.name, categoryName: "金融条件与银行", provider: "fred", frequency: "季度" });
    assert.equal(placement?.subgroup, row.subgroup);
  }
  for (const row of NYFED_HHDC_SERIES) {
    assert.equal(resolveGlobalCatalogPlacement({ key: `mds:${row.code}`, countryCode: "US", label: row.name, categoryName: "金融条件与银行", provider: "mds", frequency: "季度" }).subgroup, "居民消费信贷");
  }
});
test("each new native series belongs to exactly one release package, as does real PCE", () => {
  for (const row of [...CONSUMER_PRESSURE_FRED.map(r => ({ code: `sched_fred_${r.fredId}`, fredSeriesId: r.fredId })), ...NYFED_HHDC_SERIES.map(r => ({ code: r.code, fredSeriesId: null })), { code: "sched_fred_PCEC96", fredSeriesId: "PCEC96" }]) {
    assert.equal(RELEASE_PACKAGE_CATALOG.filter(p => instrumentMatchesPackageMember(row, p.members)).length, 1, row.code);
  }
});
test("targeted layout is idempotent and preserves unrelated countries and manual entries", () => {
  const layout = { version: 1 as const, countries: [{ countryCode: "US", categories: [{ id: "financial", name: "金融条件与银行", itemKeys: ["mds:nyfed_hhdc_auto_balance", "fred:KEEP"], subgroups: [] }] }, { countryCode: "CN", categories: [] }] };
  const placed = placeConsumerPressureKeys(layout);
  assert.deepEqual(placeConsumerPressureKeys(placed), placed);
  assert.deepEqual(placed.countries[1], layout.countries[1]);
  assert.deepEqual(placed.countries[0].categories[0].itemKeys, ["fred:KEEP"]);
  assert.equal(layout.countries[0].categories[0].itemKeys.length, 2);
});
test("pre-1950 FRED history survives empty-store bootstrap without changing ordinary revision windows", () => {
  const meta = { observationStartDate: "1945-10-01" };
  assert.equal(fredBootstrapObservationStart("1950-01-01", meta), "1945-10-01");
  assert.equal(fredBootstrapObservationStart("2020-01-01", meta), "2020-01-01");
  assert.equal(fredBootstrapObservationStart("1950-01-01", { observationStartDate: "1945-02-30" }), "1950-01-01");
  assert.equal(fredBootstrapObservationStart("1950-01-01", { observationStartDate: "1987-10-01" }), "1950-01-01");
});
