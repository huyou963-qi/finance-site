import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as XLSX from "xlsx";
import { JP_METI_RETAIL_SERIES } from "./catalog";
import { parseJpMetiRetailWorkbook } from "./parser";

const fixture = readFileSync(new URL("./fixtures/headlines.xlsx", import.meta.url));
const asOf = new Date("2026-09-13T00:00:00Z");
function mutate(edit: (workbook: XLSX.WorkBook) => void) {
  const workbook = XLSX.read(fixture);
  edit(workbook);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("parses five core official nominal retail sales levels without derived growth", () => {
  const parsed = parseJpMetiRetailWorkbook(fixture, asOf);
  assert.equal(Object.keys(parsed).length, 5);
  assert.equal(parsed.meti_jp_retail_retail_total_value_nsa.length, 558);
  assert.equal(parsed.meti_jp_retail_retail_total_value_nsa[0].value, 6396);
  assert.equal(parsed.meti_jp_retail_retail_total_value_nsa.at(-1)!.value, 13034);
  assert.equal(parsed.meti_jp_retail_fuel_value_nsa[0].obsDate.toISOString(), "1997-07-01T00:00:00.000Z");
  assert.equal(parsed.meti_jp_retail_nonstore_value_nsa[0].obsDate.toISOString(), "2015-07-01T00:00:00.000Z");
  for (const series of JP_METI_RETAIL_SERIES) {
    assert.equal(parsed[series.instrumentCode].at(-1)!.obsDate.toISOString(), "2026-06-01T00:00:00.000Z");
  }
});

test("scope, units, dates and unexpected markers fail closed", () => {
  assert.throws(() => parseJpMetiRetailWorkbook(mutate((workbook) => { workbook.Sheets["販売額（value）(月次M)"].A1.v = "different"; }), asOf));
  assert.throws(() => parseJpMetiRetailWorkbook(mutate((workbook) => { workbook.Sheets["販売額（value）(月次M)"].U4.v = "百万円"; }), asOf));
  assert.throws(() => parseJpMetiRetailWorkbook(mutate((workbook) => { workbook.Sheets["販売額（value）(月次M)"].A8.v = "1980001313"; }), asOf));
  assert.throws(() => parseJpMetiRetailWorkbook(mutate((workbook) => { workbook.Sheets["販売額（value）(月次M)"].U100 = { t: "s", v: "n/a" }; }), asOf));
});

test("internal gaps, truncated history and future periods fail closed", () => {
  assert.throws(() => parseJpMetiRetailWorkbook(mutate((workbook) => { workbook.Sheets["販売額（value）(月次M)"].U100 = { t: "s", v: "***" }; }), asOf));
  assert.throws(() => parseJpMetiRetailWorkbook(mutate((workbook) => { workbook.Sheets["販売額（value）(月次M)"]["!ref"] = "A1:AI400"; }), asOf));
  assert.throws(() => parseJpMetiRetailWorkbook(fixture, new Date("2026-05-01T00:00:00Z")));
});
