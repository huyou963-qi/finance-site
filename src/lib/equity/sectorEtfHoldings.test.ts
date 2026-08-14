import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { parseSsgaHoldingsWorkbook, validateEtfHoldingSnapshot } from "./sectorEtfHoldings";

test("parseSsgaHoldingsWorkbook parses percent weights and as-of date", () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Fund Name:", "Test Fund"],
    ["Ticker Symbol:", "XLK"],
    ["Holdings:", "As of 11-Aug-2026"],
    [],
    ["Name", "Ticker", "Identifier", "SEDOL", "Weight", "Sector", "Shares Held"],
    ["A", "AAA", "111111111", "", 60, "-", 10],
    ["B", "BBB", "222222222", "", 40, "-", 20],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "holdings");
  const parsed = parseSsgaHoldingsWorkbook(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), "XLK");
  assert.equal(parsed.asOfDate, "2026-08-11");
  assert.equal(parsed.rows[0]!.weight, 0.6);
  assert.equal(parsed.totalWeight, 1);
});

test("validateEtfHoldingSnapshot rejects incomplete snapshots", () => {
  assert.throws(
    () => validateEtfHoldingSnapshot([{ etf: "XLK", asOfDate: "2026-08-11", holdingKey: "A", symbol: "A", cusip: null, name: "A", weight: 0.2, shares: null }]),
    /90%–105%/,
  );
});
