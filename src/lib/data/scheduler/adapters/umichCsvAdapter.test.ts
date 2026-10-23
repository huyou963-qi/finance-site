import assert from "node:assert/strict";
import test from "node:test";
import { parseUmichCsv } from "./umichCsvAdapter";

test("official CSV keeps final and preliminary periods distinct, accepts genuine zero", () => {
  const result = parseUmichCsv("DATE OF SURVEY,,,,INDEX\r\nSeptember,2026,,,48.1\r\nOctober (P),2026,,,46.3\r\n");
  assert.equal(result.points.length, 2);
  assert.equal(result.points[0].value, 48.1);
  assert.deepEqual(result.preliminaryPeriods, ["2026-10-01"]);
  assert.deepEqual(parseUmichCsv("October,2026,,,46.3").preliminaryPeriods, []);
  assert.equal(parseUmichCsv("October,2026,,,0").points[0].value, 0);
  assert.throws(() => parseUmichCsv("October,2026,,,na"));
  assert.throws(() => parseUmichCsv("<html>blocked</html>"));
  assert.throws(() => parseUmichCsv("October,2026,,,46.3\nOctober,2026,,,46.3"));
});
