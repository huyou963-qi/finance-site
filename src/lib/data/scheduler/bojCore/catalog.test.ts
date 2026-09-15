import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseBojResponse } from "../boj/parser";
import {
  JP_BOJ_CALL_RATE_PACKAGE_ID,
  JP_BOJ_CORE_SERIES,
  JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
  JP_BOJ_FLOW_OF_FUNDS_SERIES,
  JP_BOJ_FX_PACKAGE_ID,
} from "./catalog";

type MetadataRow = {
  SERIES_CODE: string;
  NAME_OF_TIME_SERIES: string;
  UNIT: string;
  FREQUENCY: string;
  START_OF_THE_TIME_SERIES: string;
  END_OF_THE_TIME_SERIES: string;
  LAST_UPDATE: string;
};

const fixtureDir = join(process.cwd(), "src/lib/data/scheduler/bojCore/fixtures");

test("BOJ core catalogue exactly matches selected official metadata", () => {
  const metadata = JSON.parse(
    readFileSync(join(fixtureDir, "metadata-selected.json"), "utf8"),
  ) as MetadataRow[];
  assert.equal(JP_BOJ_CORE_SERIES.length, 10);
  assert.equal(JP_BOJ_FLOW_OF_FUNDS_SERIES.length, 8);
  assert.equal(new Set(JP_BOJ_CORE_SERIES.map((row) => row.instrumentCode)).size, 10);
  assert.equal(new Set(JP_BOJ_CORE_SERIES.map((row) => `${row.db}:${row.seriesCode}`)).size, 10);
  for (const row of JP_BOJ_CORE_SERIES) {
    const official = metadata.find(
      (candidate) => candidate.SERIES_CODE === row.seriesCode,
    );
    assert.ok(official, `missing official metadata for ${row.seriesCode}`);
    assert.equal(official.NAME_OF_TIME_SERIES, row.sourceName);
    assert.equal(official.UNIT, row.sourceUnit);
    assert.equal(official.FREQUENCY, row.frequency);
    assert.equal(official.START_OF_THE_TIME_SERIES, row.startPeriod);
    assert.match(official.END_OF_THE_TIME_SERIES, /^\d{6}$/);
    assert.match(official.LAST_UPDATE, /^\d{8}$/);
  }
  assert.equal(JP_BOJ_CORE_SERIES[8].releasePackageId, JP_BOJ_CALL_RATE_PACKAGE_ID);
  assert.equal(JP_BOJ_CORE_SERIES[9].releasePackageId, JP_BOJ_FX_PACKAGE_ID);
  assert.ok(
    JP_BOJ_FLOW_OF_FUNDS_SERIES.every(
      (row) => row.releasePackageId === JP_BOJ_FLOW_OF_FUNDS_PACKAGE_ID,
    ),
  );
});

test("official BOJ fixtures parse into complete monthly and quarterly histories", () => {
  const expected = new Map<string, { count: number; first: string; last: string }>([
    ...JP_BOJ_FLOW_OF_FUNDS_SERIES.map(
      (row) => [row.key, { count: 114, first: "1997-10-01", last: "2026-01-01" }] as const,
    ),
    [
      "uncollateralized_overnight_call_rate",
      { count: 494, first: "1985-07-01", last: "2026-08-01" },
    ],
    ["usd_jpy_monthly_average", { count: 644, first: "1973-01-01", last: "2026-08-01" }],
  ]);
  for (const row of JP_BOJ_CORE_SERIES) {
    const body = JSON.parse(readFileSync(join(fixtureDir, `${row.key}.json`), "utf8"));
    const result = parseBojResponse(body, row);
    const wanted = expected.get(row.key)!;
    assert.equal(result.points.length, wanted.count);
    assert.equal(result.points[0].obsDate.toISOString().slice(0, 10), wanted.first);
    assert.equal(result.points.at(-1)!.obsDate.toISOString().slice(0, 10), wanted.last);
    assert.equal(result.skippedInvalid, 0);
    for (let index = 1; index < result.points.length; index++) {
      const previous = result.points[index - 1].obsDate;
      const months = row.frequency === "QUARTERLY" ? 3 : 1;
      assert.equal(
        result.points[index].obsDate.getTime(),
        Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + months, 1),
      );
    }
  }
});

test("official signed net positions and policy proxy values are preserved", () => {
  const government = JP_BOJ_CORE_SERIES[6];
  const body = JSON.parse(
    readFileSync(join(fixtureDir, `${government.key}.json`), "utf8"),
  );
  body.RESULTSET[0].VALUES = {
    SURVEY_DATES: [202503, 202504, 202601],
    VALUES: [-25, 0, 10],
  };
  assert.deepEqual(
    parseBojResponse(body, government).points.map((point) => point.value),
    [-25, 0, 10],
  );

  const callRate = JP_BOJ_CORE_SERIES[8];
  const callBody = JSON.parse(
    readFileSync(join(fixtureDir, `${callRate.key}.json`), "utf8"),
  );
  assert.ok(parseBojResponse(callBody, callRate).points.some((point) => point.value < 0));
});
