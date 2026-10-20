import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { EIA_WPSR_SERIES } from "./catalog";
import { parseEiaWpsrWorkbook } from "./parseWorkbook";

const SERIES = EIA_WPSR_SERIES[0]!;

function workbook(options?: {
  sourceKey?: string;
  omitContents?: boolean;
  badHeader?: boolean;
  rows?: unknown[][];
}): XLSX.WorkBook {
  const dataRows = options?.rows ?? [
    ["Back to Contents", `Data 1: ${SERIES.name}`],
    ["Sourcekey", options?.sourceKey ?? SERIES.sourceSeriesKey],
    [options?.badHeader ? "Observation" : "Date", SERIES.name],
    [43833, 120_000], // 2020-01-03
    [43840, 121_500], // 2020-01-10
  ];
  const wb = XLSX.utils.book_new();
  if (!options?.omitContents) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Workbook Contents", null, null, null, null],
        [SERIES.name, null, null, null, null],
        [null, null, null, null, null],
        ["Click worksheet name or tab at bottom for data", null, null, null, null],
        ["Worksheet Name", "Description", "# Of Series", "Frequency", "Latest Data for"],
        ["Data 1", SERIES.name, 1, "Weekly", "1/10/2020"],
      ]),
      "Contents",
    );
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), "Data 1");
  return wb;
}

test("parses the anchored weekly EIA workbook", () => {
  const parsed = parseEiaWpsrWorkbook(workbook(), SERIES);
  assert.deepEqual(
    parsed.points.map((point) => [point.obsDate.toISOString().slice(0, 10), point.value]),
    [
      ["2020-01-03", 120_000],
      ["2020-01-10", 121_500],
    ],
  );
  assert.equal(parsed.latestObsDate.toISOString().slice(0, 10), "2020-01-10");
  assert.equal(parsed.skippedInvalid, 0);
});

test("throws when a required sheet or anchor disappears", () => {
  assert.throws(() => parseEiaWpsrWorkbook(workbook({ omitContents: true }), SERIES), /缺少/);
  assert.throws(() => parseEiaWpsrWorkbook(workbook({ badHeader: true }), SERIES), /锚点/);
});

test("throws when Sourcekey does not match the catalog entry", () => {
  assert.throws(
    () => parseEiaWpsrWorkbook(workbook({ sourceKey: "OTHER" }), SERIES),
    /Sourcekey/,
  );
});

test("throws on invalid values, non-Friday dates and non-increasing dates", () => {
  const base = [
    ["Back to Contents", `Data 1: ${SERIES.name}`],
    ["Sourcekey", SERIES.sourceSeriesKey],
    ["Date", SERIES.name],
  ];
  assert.throws(
    () => parseEiaWpsrWorkbook(workbook({ rows: [...base, [43833, "n/a"]] }), SERIES),
    /数值无效/,
  );
  assert.throws(
    () => parseEiaWpsrWorkbook(workbook({ rows: [...base, [43834, 120_000]] }), SERIES),
    /不是周五/,
  );
  assert.throws(
    () =>
      parseEiaWpsrWorkbook(
        workbook({ rows: [...base, [43840, 120_000], [43833, 119_000]] }),
        SERIES,
      ),
    /未严格递增/,
  );
});

test("throws when Contents latest date disagrees with the final observation", () => {
  const wb = workbook();
  const contents = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Contents!, {
    header: 1,
    raw: true,
    defval: null,
  });
  contents[5]![4] = "1/17/2020";
  wb.Sheets.Contents = XLSX.utils.aoa_to_sheet(contents);
  assert.throws(() => parseEiaWpsrWorkbook(wb, SERIES), /不一致/);
});
