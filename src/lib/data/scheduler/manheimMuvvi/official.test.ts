import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { findLatestOfficialReport, findOfficialWorkbookUrl, parseOfficialManheimWorkbook } from "./official";

test("monthly archive discovery excludes newer mid-month checkpoint", () => {
  const html = `<a href="https://www.coxautoinc.com/insights/manheim-used-vehicle-value-index-mid-september-2026-trends/">Mid-September</a>
    <a href="https://www.coxautoinc.com/insights/manheim-used-vehicle-value-index-august-2026-trends/">August</a>`;
  assert.deepEqual(findLatestOfficialReport(html), {
    month: "2026-08",
    reportUrl: "https://www.coxautoinc.com/insights/manheim-used-vehicle-value-index-august-2026-trends/",
  });
});

test("download link must be the official Cox XLSX", () => {
  assert.equal(findOfficialWorkbookUrl('<a href="https://www.coxautoinc.com/wp-content/uploads/2026/09/August.xlsx">Download the Data</a>'), "https://www.coxautoinc.com/wp-content/uploads/2026/09/August.xlsx");
  assert.throws(() => findOfficialWorkbookUrl('<a href="https://example.com/August.xlsx">Download the Data</a>'));
});

test("official workbook uses the index column and rejects a report-month mismatch", () => {
  const rows: (string | number)[][] = [["", "Index (1/97 = 100)"]];
  for (let year = 1997; year <= 2026; year++) {
    for (let month = 0; month < 12 && (year < 2026 || month <= 7); month++) {
      const date = new Date(Date.UTC(year, month, year === 2002 && month === 0 ? 2 : 1));
      rows.push([(date.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000, year === 1997 && month === 0 ? 100 : 120]);
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "DATA");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const points = parseOfficialManheimWorkbook(buffer, "2026-08");
  assert.equal(points.length, 356);
  assert.equal(points.at(-1)?.obsDate.toISOString().slice(0, 10), "2026-08-01");
  assert.throws(() => parseOfficialManheimWorkbook(buffer, "2026-09"));
});
