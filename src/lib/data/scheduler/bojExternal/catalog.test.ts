import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseBojResponse } from "../boj/parser";
import { JP_BOJ_BOP_PACKAGE_ID, JP_BOJ_BOP_SERIES } from "./catalog";

type MetadataRow = {
  SERIES_CODE: string;
  NAME_OF_TIME_SERIES: string;
  UNIT: string;
  FREQUENCY: string;
  START_OF_THE_TIME_SERIES: string;
  END_OF_THE_TIME_SERIES: string;
  LAST_UPDATE: string;
};

const fixtureDir = join(process.cwd(), "src/lib/data/scheduler/bojExternal/fixtures");

test("BOJ BOP catalogue matches official selected metadata", () => {
  const metadata = JSON.parse(
    readFileSync(join(fixtureDir, "metadata-selected.json"), "utf8"),
  ) as MetadataRow[];
  assert.equal(JP_BOJ_BOP_SERIES.length, 8);
  assert.equal(new Set(JP_BOJ_BOP_SERIES.map((row) => row.instrumentCode)).size, 8);
  assert.equal(new Set(JP_BOJ_BOP_SERIES.map((row) => row.seriesCode)).size, 8);
  for (const row of JP_BOJ_BOP_SERIES) {
    const official = metadata.find((candidate) => candidate.SERIES_CODE === row.seriesCode);
    assert.ok(official, `missing official metadata for ${row.seriesCode}`);
    assert.equal(official.NAME_OF_TIME_SERIES, row.sourceName);
    assert.equal(official.UNIT, row.sourceUnit);
    assert.equal(official.FREQUENCY, row.frequency);
    assert.equal(official.START_OF_THE_TIME_SERIES, row.startPeriod);
    assert.match(official.END_OF_THE_TIME_SERIES, /^\d{6}$/);
    assert.match(official.LAST_UPDATE, /^\d{8}$/);
    assert.equal(row.releasePackageId, JP_BOJ_BOP_PACKAGE_ID);
  }
});

test("BOJ BOP official fixtures parse as continuous monthly linked histories", () => {
  for (const row of JP_BOJ_BOP_SERIES) {
    const body = JSON.parse(readFileSync(join(fixtureDir, `${row.key}.json`), "utf8"));
    const result = parseBojResponse(body, row);
    assert.equal(result.points.length, 367);
    assert.equal(result.points[0].obsDate.toISOString().slice(0, 10), "1996-01-01");
    assert.equal(result.points.at(-1)!.obsDate.toISOString().slice(0, 10), "2026-07-01");
    assert.equal(result.skippedInvalid, 0);
    for (let index = 1; index < result.points.length; index++) {
      const previous = result.points[index - 1].obsDate;
      assert.equal(
        result.points[index].obsDate.getTime(),
        Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1),
      );
    }
  }
});

test("BOJ BOP parser preserves published positive, zero and negative net balances", () => {
  const row = JP_BOJ_BOP_SERIES[1];
  const body = JSON.parse(readFileSync(join(fixtureDir, "goods.json"), "utf8"));
  body.RESULTSET[0].VALUES = {
    SURVEY_DATES: [202601, 202602, 202603],
    VALUES: [-10, 0, 25],
  };
  const result = parseBojResponse(body, row);
  assert.deepEqual(result.points.map((point) => point.value), [-10, 0, 25]);
});
