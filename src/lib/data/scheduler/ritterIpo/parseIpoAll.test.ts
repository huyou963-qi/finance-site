import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseRitterIpoAll } from "./parseIpoAll";

const SHEET_NAME = "IPOALL";

function workbookFromRows(rows: unknown[][], sheetName = SHEET_NAME): XLSX.WorkBook {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
    type: "buffer",
  });
}

/** 复刻真实文件的形状：无表头、两位数年份、各列起始年份不同用字符串哨兵占位、末尾脚注行 */
function fixtureWorkbook(): XLSX.WorkBook {
  return workbookFromRows([
    [1, 60, 13.8, 16, "see 1975", "see 1980", "The columns are the month, year, ..."],
    [2, 60, 8, 16, "see 1975", "see 1980"],
    [1, 75, 21.4, 12, 4, "see 1980"],
    [1, 80, 12.5, 30, 20, 100],
    [12, 24, 127.4, 20, 3, 100],
    [12, 25, 10.6, 33, 7, 43],
    ["the first column is the month", "the second column is the year"],
    ["direct listings are included in the total count but not the net count"],
  ]);
}

test("parses four series with per-column start dates and two-digit years", () => {
  const parsed = parseRitterIpoAll(fixtureWorkbook());
  const iso = (k: Parameters<typeof parsed.pointsBySeries.get>[0]) =>
    parsed.pointsBySeries.get(k)!.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]);

  // 60 -> 1960, 24 -> 2024, 25 -> 2025
  assert.deepEqual(iso("first_day_return"), [
    ["1960-01-01", 13.8],
    ["1960-02-01", 8],
    ["1975-01-01", 21.4],
    ["1980-01-01", 12.5],
    ["2024-12-01", 127.4],
    ["2025-12-01", 10.6],
  ]);
  // "see 1975" / "see 1980" 哨兵不得变成数据点
  assert.deepEqual(iso("count_net"), [
    ["1975-01-01", 4],
    ["1980-01-01", 20],
    ["2024-12-01", 3],
    ["2025-12-01", 7],
  ]);
  assert.deepEqual(iso("above_midpoint_pct"), [
    ["1980-01-01", 100],
    ["2024-12-01", 100],
    ["2025-12-01", 43],
  ]);
  assert.equal(parsed.pointsBySeries.get("count_gross")!.length, 6);
  assert.equal(
    parsed.latestObsDateBySeries.get("count_gross")?.toISOString().slice(0, 10),
    "2025-12-01",
  );
  // 脚注行与哨兵都不算异常
  assert.equal(parsed.skippedInvalid, 0);
});

test('treats "." and "na" as documented gaps, not errors', () => {
  const parsed = parseRitterIpoAll(
    workbookFromRows([
      [1, 80, ".", 5, 2, "na"],
      [2, 80, 10, 6, 3, 50],
    ]),
  );
  assert.equal(parsed.pointsBySeries.get("first_day_return")!.length, 1);
  assert.equal(parsed.pointsBySeries.get("above_midpoint_pct")!.length, 1);
  assert.equal(parsed.skippedInvalid, 0);
});

test("counts unknown non-numeric cells as skippedInvalid so source drift surfaces", () => {
  const parsed = parseRitterIpoAll(
    workbookFromRows([
      [1, 80, "pending", 5, 2, 50],
      [2, 80, 10, 6, 3, 50],
    ]),
  );
  assert.equal(parsed.pointsBySeries.get("first_day_return")!.length, 1);
  assert.equal(parsed.skippedInvalid, 1);
});

test("rejects out-of-range values instead of writing them", () => {
  const parsed = parseRitterIpoAll(
    workbookFromRows([
      [1, 80, 12, 5, 2, 999], // above_midpoint_pct 上限 100
      [2, 80, 10, 6, 3, 50],
    ]),
  );
  assert.deepEqual(
    parsed.pointsBySeries.get("above_midpoint_pct")!.map((p) => p.value),
    [50],
  );
  assert.equal(parsed.skippedInvalid, 1);
});

test("dedupes repeated months, keeping the first occurrence", () => {
  const parsed = parseRitterIpoAll(
    workbookFromRows([
      [1, 80, 12, 5, 2, 50],
      [1, 80, 99, 77, 44, 90],
    ]),
  );
  assert.deepEqual(
    parsed.pointsBySeries.get("count_gross")!.map((p) => p.value),
    [5],
  );
});

test("throws when the sheet is missing", () => {
  assert.throws(() => parseRitterIpoAll(workbookFromRows([[1, 80, 1, 1, 1, 1]], "Wrong")), /缺 sheet/);
});

test("throws when no data rows are recognizable (e.g. source adds a header)", () => {
  const wb = workbookFromRows([
    ["Month", "Year", "First-day return", "Gross", "Net", "Above midpoint"],
    ["Jan", "1980", 12, 5, 2, 50],
  ]);
  assert.throws(() => parseRitterIpoAll(wb), /未识别到任何数据行/);
});

test("throws when a series ends up empty", () => {
  // 净家数列整列都是哨兵 → 该分项 0 点，必须报错而不是静默产出空序列
  const wb = workbookFromRows([
    [1, 60, 13.8, 16, "see 1975", "see 1980"],
    [2, 60, 8, 16, "see 1975", "see 1980"],
  ]);
  assert.throws(() => parseRitterIpoAll(wb), /count_net/);
});
