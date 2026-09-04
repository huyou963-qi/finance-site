import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseGscpiWorkbook } from "./parseGscpiWorkbook";

function fixtureWorkbook(opts?: { dropValueColumn?: boolean; sheetName?: string }): XLSX.WorkBook {
  const rows: unknown[][] = [
    ["Date", "GSCPI", null, null],
    [null, null, null, "NEW YORK FED  ECONOMIC RESEARCH"],
    [null, null, null, null],
    [null, null, null, "https://www.newyorkfed.org/research"],
    [null, null, null, null],
  ];
  if (opts?.dropValueColumn) {
    rows[0] = ["Date", "SomethingElse", null, null];
  }
  rows.push(["31-Jan-1998", -1.1475479560042845, null, null]);
  rows.push(["28-Feb-1998", -0.440288707134945, null, null]);
  rows.push(["31-Mar-2026", 0.6767299118883605, null, null]);
  rows.push(["30-Apr-2026", 1.842277174877714, null, null]);

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, opts?.sheetName ?? "GSCPI Monthly Data");
  return XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
    type: "buffer",
  });
}

test("parses monthly GSCPI series, normalizing dates to month start and rounding to 4dp", () => {
  const parsed = parseGscpiWorkbook(fixtureWorkbook());
  assert.equal(parsed.points.length, 4);
  assert.deepEqual(
    parsed.points.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]),
    [
      ["1998-01-01", -1.1475],
      ["1998-02-01", -0.4403],
      ["2026-03-01", 0.6767],
      ["2026-04-01", 1.8423],
    ],
  );
  assert.equal(parsed.latestObsDate?.toISOString().slice(0, 10), "2026-04-01");
  assert.equal(parsed.skippedInvalid, 0);
});

test("throws when the sheet is missing", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["x"]]), "Wrong Sheet");
  assert.throws(
    () =>
      parseGscpiWorkbook(
        XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" }),
      ),
    /缺 sheet/,
  );
});

test("throws when the Date/GSCPI header row disappears", () => {
  assert.throws(() => parseGscpiWorkbook(fixtureWorkbook({ dropValueColumn: true })), /未找到含/);
});

test("skips rows with unparseable dates, non-numeric values, and out-of-range values", () => {
  const rows: unknown[][] = [
    ["Date", "GSCPI", null, null],
    ["not a date", 1.0, null, null],
    ["31-Jan-2020", "n/a", null, null],
    ["28-Feb-2020", 999, null, null],
    ["31-Mar-2020", 0.5, null, null],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "GSCPI Monthly Data");
  const wb = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
    type: "buffer",
  });
  const parsed = parseGscpiWorkbook(wb);
  assert.equal(parsed.points.length, 1);
  assert.equal(parsed.points[0]!.value, 0.5);
  assert.equal(parsed.skippedInvalid, 3);
});

test("throws when 0 valid points parsed", () => {
  const rows: unknown[][] = [
    ["Date", "GSCPI", null, null],
    ["garbage", "garbage", null, null],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "GSCPI Monthly Data");
  const wb = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
    type: "buffer",
  });
  assert.throws(() => parseGscpiWorkbook(wb));
});

test("dedupes same-month rows, keeping the first occurrence", () => {
  const rows: unknown[][] = [
    ["Date", "GSCPI", null, null],
    ["31-Jan-2020", 0.5, null, null],
    ["15-Jan-2020", 9.9, null, null],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "GSCPI Monthly Data");
  const wb = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
    type: "buffer",
  });
  const parsed = parseGscpiWorkbook(wb);
  assert.equal(parsed.points.length, 1);
  assert.equal(parsed.points[0]!.value, 0.5);
});
