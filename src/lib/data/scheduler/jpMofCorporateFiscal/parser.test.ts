import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseJpMofFiscalResultsWorkbook } from "./parser";

function fixture(lastYear: number, names = [`昭和41-令和${lastYear - 2018}`]): Buffer {
  const years = Array.from({ length: lastYear - 1966 + 1 }, (_, i) => 1966 + i);
  const labels = years.map(year => year < 1989 ? `昭和${year - 1925}年度` : year < 2019 ? `平成${year - 1988}年度` : `令和${year - 2018}年度`);
  const sheet = XLSX.utils.aoa_to_sheet([
    ["単位：千円"], ["年度", ...labels],
    ["一般会計歳入決算総額", ...years.map(() => "135,980,878,488")],
    ["一般会計歳出決算総額", ...years.map(() => "123,023,998,630")],
    ["財政法第41条の剰余金", ...years.map(() => "12,956,879,859")],
  ]);
  const wb = XLSX.utils.book_new();
  for (const name of names) XLSX.utils.book_append_sheet(wb, sheet, name);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

test("MOF fiscal rolling sheet accepts the next fiscal year without changing precise units", () => {
  for (const year of [2024, 2025, 2026]) {
    const output = parseJpMofFiscalResultsWorkbook(fixture(year));
    assert.equal(output.revenue.at(-1)?.obsDate.toISOString(), `${year}-04-01T00:00:00.000Z`);
    assert.equal(output.revenue.at(-1)?.value, 135980878.488);
    assert.equal(output.expenditure.at(-1)?.value, 123023998.63);
    assert.equal(output.surplus.length, year - 1966 + 1);
  }
});

test("MOF fiscal refuses ambiguous histories and a budget sheet", () => {
  assert.throws(() => parseJpMofFiscalResultsWorkbook(fixture(2025, ["昭和41-令和6", "昭和41-令和7"])), /ambiguous/);
  assert.throws(() => parseJpMofFiscalResultsWorkbook(fixture(2025, ["令和7予算"])), /missing/);
});

test("MOF fiscal refuses a sheet range that does not match actual published columns", () => {
  assert.throws(() => parseJpMofFiscalResultsWorkbook(fixture(2024, ["昭和41-令和7"])), /range\/header mismatch/);
});
