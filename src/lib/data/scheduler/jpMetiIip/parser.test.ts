import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseJpMetiIipWorkbook } from "./parser";

const fixture = readFileSync(new URL("./fixtures/headlines.xlsx", import.meta.url));
const asOf = new Date("2026-09-09T00:00:00Z");
function mutate(edit: (workbook: XLSX.WorkBook) => void) {
  const workbook = XLSX.read(fixture); edit(workbook);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
test("official four component fixture, month anchor and preliminary marker", () => {
  const parsed = parseJpMetiIipWorkbook(fixture, asOf);
  assert.equal(Object.keys(parsed).length, 4);
  for (const series of Object.values(parsed)) {
    assert.equal(series.points.length, 103);
    assert.equal(series.points[0].obsDate.toISOString(), "2018-01-01T00:00:00.000Z");
    assert.deepEqual(series.preliminaryDates, ["2026-07-01"]);
  }
  assert.equal(parsed.meti_jp_iip_production_sa.points[0].value, 112.3);
  assert.equal(parsed.meti_jp_iip_production_sa.points.at(-1)!.value, 104.7);
  assert.equal(parsed.meti_jp_iip_inventory_ratio_sa.points.at(-1)!.value, 104.7);
});
test("missing sheet, changed base and ambiguous total fail closed", () => {
  assert.throws(() => parseJpMetiIipWorkbook(mutate(w => { delete w.Sheets["生産"]; w.SheetNames = w.SheetNames.filter(s => s !== "生産"); }), asOf));
  assert.throws(() => parseJpMetiIipWorkbook(mutate(w => { w.Sheets["生産"].A1.v = "2025＝100.0"; }), asOf));
  assert.throws(() => parseJpMetiIipWorkbook(mutate(w => { w.Sheets["生産"].B4.v = "製造工業"; }), asOf));
});
test("invalid dates, missing values and future observations fail closed", () => {
  assert.throws(() => parseJpMetiIipWorkbook(mutate(w => { w.Sheets["生産"].D3.v = 201813; }), asOf));
  assert.throws(() => parseJpMetiIipWorkbook(mutate(w => { w.Sheets["生産"].D4 = { t: "s", v: "-" }; }), asOf));
  assert.throws(() => parseJpMetiIipWorkbook(fixture, new Date("2026-06-01")));
});

test("duplicate month and mismatched component end fail closed", () => {
  assert.throws(() => parseJpMetiIipWorkbook(mutate(w => { w.Sheets["生産"].E3.v = 201801; }), asOf));
  assert.throws(() => parseJpMetiIipWorkbook(mutate(w => {
    const range = XLSX.utils.decode_range(w.Sheets["在庫率"]["!ref"]!);
    range.e.c--;
    w.Sheets["在庫率"]["!ref"] = XLSX.utils.encode_range(range);
  }), asOf));
});

test("old seasonal revisions are preserved in full output", () => {
  const revised = parseJpMetiIipWorkbook(mutate(w => { w.Sheets["生産"].D4.v = 112.4; }), asOf);
  assert.equal(revised.meti_jp_iip_production_sa.points[0].value, 112.4);
  assert.equal(revised.meti_jp_iip_production_sa.points.length, 103);
});
