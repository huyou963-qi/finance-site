import assert from "node:assert/strict";
import test from "node:test";
import { parseZoriCsv } from "./parseZoriCsv";

const HEADER = "RegionID,SizeRank,RegionName,RegionType,StateName,2015-01-31,2015-02-28,2026-07-31,2026-08-31";

test("extracts the United States row and normalizes month-end dates to month start", () => {
  const csv = [
    HEADER,
    "102001,0,United States,country,,1234.5678,1240.1,2011.2,2018.05",
    '394913,1,"New York, NY",msa,NY,2400,2410,3500,3510',
  ].join("\n");
  const parsed = parseZoriCsv(csv);
  assert.deepEqual(
    parsed.points.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]),
    [
      ["2015-01-01", 1234.57],
      ["2015-02-01", 1240.1],
      ["2026-07-01", 2011.2],
      ["2026-08-01", 2018.05],
    ],
  );
  assert.equal(parsed.latestObsDate?.toISOString().slice(0, 10), "2026-08-01");
  assert.equal(parsed.skippedInvalid, 0);
});

test("skips empty cells and counts implausible values as invalid", () => {
  const csv = [HEADER, "102001,0,United States,country,,,1240,99999,2018"].join("\r\n");
  const parsed = parseZoriCsv(csv);
  assert.equal(parsed.points.length, 2);
  assert.equal(parsed.skippedInvalid, 1);
});

test("throws when the header layout changes or the national row is missing", () => {
  assert.throws(() => parseZoriCsv("RegionID,Name,Type\n1,x,y"), /表头/);
  assert.throws(() => parseZoriCsv(`${HEADER}\n394913,1,"New York, NY",msa,NY,1,2,3,4`), /United States/);
});
