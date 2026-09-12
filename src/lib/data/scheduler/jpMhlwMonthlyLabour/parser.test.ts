import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as XLSX from "xlsx";
import { JP_MHLW_MONTHLY_LABOUR_SERIES } from "./catalog";
import { parseJpMhlwMonthlyLabourFileList } from "./discovery";
import { parseJpMhlwMonthlyLabourWorkbook } from "./parser";

const asOf = new Date("2026-09-12T00:00:00Z");
const fixture = (code: string) =>
  readFileSync(new URL(`./fixtures/${code}.xlsx`, import.meta.url));
const mutate = (code: string, edit: (sheet: XLSX.WorkSheet) => void) => {
  const workbook = XLSX.read(fixture(code));
  edit(workbook.Sheets.TL);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

test("parses all six official TL workbook excerpts", () => {
  for (const series of JP_MHLW_MONTHLY_LABOUR_SERIES) {
    const points = parseJpMhlwMonthlyLabourWorkbook(fixture(series.instrumentCode), series, asOf);
    assert.equal(points.length, 438);
    assert.equal(points[0].obsDate.toISOString(), "1990-01-01T00:00:00.000Z");
    assert.equal(points.at(-1)!.obsDate.toISOString(), "2026-06-01T00:00:00.000Z");
  }
});

test("discovers each file by exact title, table number and report link", () => {
  const html = readFileSync(new URL("./fixtures/catalog-excerpt.html", import.meta.url), "utf8");
  const files = parseJpMhlwMonthlyLabourFileList(html);
  assert.equal(files.length, 6);
  assert.equal(files.find((file) => file.tableNo === "25-2")?.statInfId, "000040277106");
  assert(files.every((file) => file.surveyMonth === "2026-06"));
  assert.throws(() => parseJpMhlwMonthlyLabourFileList(html.replace("表番号&nbsp;7", "表番号&nbsp;8")));
  assert.throws(() => parseJpMhlwMonthlyLabourFileList(html + html));
});

test("fails closed on changed scope, base, unknown marker and a history gap", () => {
  const series = JP_MHLW_MONTHLY_LABOUR_SERIES[0];
  assert.throws(() =>
    parseJpMhlwMonthlyLabourWorkbook(
      mutate(series.instrumentCode, (sheet) => { sheet.F2.v = "３０人以上(Establishments with 30 or more employees)"; }),
      series,
      asOf,
    ),
  );
  assert.throws(() =>
    parseJpMhlwMonthlyLabourWorkbook(
      mutate(series.instrumentCode, (sheet) => { sheet.E6.v = "2025 average = 100"; }),
      series,
      asOf,
    ),
  );
  assert.throws(() =>
    parseJpMhlwMonthlyLabourWorkbook(
      mutate(series.instrumentCode, (sheet) => { sheet.I48.v = "unexpected"; }),
      series,
      asOf,
    ),
  );
  assert.throws(() =>
    parseJpMhlwMonthlyLabourWorkbook(
      mutate(series.instrumentCode, (sheet) => { sheet.I48.v = "-"; }),
      series,
      asOf,
    ),
  );
});

test("rejects a future observation relative to the run clock", () => {
  const series = JP_MHLW_MONTHLY_LABOUR_SERIES[0];
  assert.throws(() =>
    parseJpMhlwMonthlyLabourWorkbook(
      fixture(series.instrumentCode),
      series,
      new Date("2026-05-01T00:00:00Z"),
    ),
  );
});
