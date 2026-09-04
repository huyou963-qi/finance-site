import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseHistImplWorkbook } from "./parseHistImpl";

const HEADER = [
  "Year",
  "Earnings Yield",
  "Dividend Yield",
  "S&P 500",
  "Earnings*",
  "Dividends*",
  "Dividends + Buybacks",
  "Change in Earnings",
  "Change in Dividends",
  "T.Bill Rate",
  "T.Bond Rate",
  "Bond-Bill",
  "Smoothed Growth",
  "Implied Premium (DDM)",
  "Analyst Growth Estimate",
  "Implied ERP (FCFE)",
  "Implied ERP with risk adjusted riskfree rate",
  "Implied Premium (FCFE with sustainable Payout)",
  "ERP/Riskfree Rate",
];

function fixtureWorkbook(opts?: { dropErpColumn?: boolean }): XLSX.WorkBook {
  const rows: unknown[][] = [
    ["Date updated:", 43834],
    ["Created by:", "Aswath Damodaran, adamodar@stern.nyu.edu"],
    ["What is this data?", "Implied Equity Risk Premiums (by year)"],
    ["Home Page:", "http://www.damodaran.com"],
    ["Data website:", "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/data.html"],
    [],
    opts?.dropErpColumn ? HEADER.filter((h) => h !== "Implied ERP (FCFE)") : HEADER,
  ];
  const erpIdx = HEADER.indexOf("Implied ERP (FCFE)");
  // 1960 首年无 ERP（基期），后续年份有值
  rows.push([1960, 0.0534, 0.0341, 58.11, 3.1, 1.98]);
  for (let year = 1961; year <= 2025; year++) {
    const row: unknown[] = new Array(HEADER.length).fill(null);
    row[0] = year;
    if (!opts?.dropErpColumn) row[erpIdx] = 0.03 + (year % 10) / 1000;
    rows.push(row);
  }
  rows.push([]);
  rows.push(["* Earnings and dividends numbers each year reflect estimated numbers."]);
  rows.push([]);
  rows.push([null, "Period", "ERP", "ERP + Riskfree Rate"]);
  rows.push([null, "1960-2025", 0.0425, 0.0993]);

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Historical Impl Premiums");
  return XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
    type: "buffer",
  });
}

test("parses annual implied ERP series, skipping the base year and summary rows", () => {
  const parsed = parseHistImplWorkbook(fixtureWorkbook());
  assert.equal(parsed.points.length, 2025 - 1961 + 1);
  assert.equal(parsed.points[0]!.obsDate.toISOString().slice(0, 10), "1961-12-31");
  assert.equal(parsed.latestObsDate?.toISOString().slice(0, 10), "2025-12-31");
  assert.equal(parsed.skippedInvalid, 0);
});

test("throws when the sheet is missing", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["x"]]), "Wrong Sheet");
  assert.throws(
    () =>
      parseHistImplWorkbook(
        XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" }),
      ),
    /缺 sheet/,
  );
});

test("throws when the Implied ERP column disappears", () => {
  assert.throws(
    () => parseHistImplWorkbook(fixtureWorkbook({ dropErpColumn: true })),
    /未找到含/,
  );
});
