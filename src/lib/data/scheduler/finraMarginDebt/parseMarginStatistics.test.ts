import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseFinraMarginStatistics } from "./parseMarginStatistics";

const SHEET_NAME = "Customer Margin Balances";
const DEBIT_HEADER = "Debit Balances in Customers' Securities Margin Accounts";
const CASH_HEADER = "Free Credit Balances in Customers' Cash Accounts";
const MARGIN_HEADER = "Free Credit Balances in Customers' Securities Margin Accounts";

function workbookFromRows(rows: unknown[][], sheetName = SHEET_NAME): XLSX.WorkBook {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
    type: "buffer",
  });
}

function fixtureWorkbook(): XLSX.WorkBook {
  return workbookFromRows([
    ["FINRA Margin Statistics"],
    [null],
    ["Year-Month", DEBIT_HEADER, CASH_HEADER, MARGIN_HEADER],
    ["1997-01", 103337, 50000],
    ["2010-01", 200000, 60000],
    ["2010-02", 210000, 61000, 164624],
    ["2026-07", 1417225, 205132, 217305],
  ]);
}

test("parses debit balances and free-credit series, respecting per-column presence", () => {
  const parsed = parseFinraMarginStatistics(fixtureWorkbook());
  const debit = parsed.pointsBySeries.get("debit_balances")!;
  const cash = parsed.pointsBySeries.get("free_credit_cash")!;
  const margin = parsed.pointsBySeries.get("free_credit_margin")!;

  assert.equal(debit.length, 4);
  assert.equal(cash.length, 4);
  // free_credit_margin column absent before 2010-02 — must not appear as 0 or null-valued point
  assert.equal(margin.length, 2);
  assert.deepEqual(
    margin.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]),
    [
      ["2010-02-01", 164624],
      ["2026-07-01", 217305],
    ],
  );
  assert.equal(parsed.latestObsDateBySeries.get("debit_balances")?.toISOString().slice(0, 10), "2026-07-01");
  assert.equal(parsed.skippedInvalid, 0);
});

test("throws when the sheet is missing", () => {
  const wb = workbookFromRows([["x"]], "Wrong Sheet");
  assert.throws(() => parseFinraMarginStatistics(wb), /缺 sheet/);
});

test("throws when the Year-Month header row disappears", () => {
  const wb = workbookFromRows([
    ["Month", DEBIT_HEADER],
    ["1997-01", 100],
  ]);
  assert.throws(() => parseFinraMarginStatistics(wb), /未找到含/);
});

test("throws when the debit-balances anchor column is missing", () => {
  const wb = workbookFromRows([
    ["Year-Month", CASH_HEADER],
    ["1997-01", 100],
  ]);
  assert.throws(() => parseFinraMarginStatistics(wb), /表头缺/);
});

test("skips unparseable dates, out-of-range values, and dedupes same-month rows", () => {
  const wb = workbookFromRows([
    ["Year-Month", DEBIT_HEADER],
    ["not-a-date", 100],
    ["1997-01", 999_999_999_999],
    ["1997-02", 100000],
    ["1997-02", 999999],
  ]);
  const parsed = parseFinraMarginStatistics(wb);
  const debit = parsed.pointsBySeries.get("debit_balances")!;
  assert.equal(debit.length, 1);
  assert.equal(debit[0]!.value, 100000);
  assert.equal(parsed.skippedInvalid, 2);
});

test("throws when a series ends up with 0 valid points", () => {
  const wb = workbookFromRows([
    ["Year-Month", DEBIT_HEADER, MARGIN_HEADER],
    ["1997-01", 100000, "n/a"],
  ]);
  assert.throws(() => parseFinraMarginStatistics(wb), /free_credit_margin/);
});
