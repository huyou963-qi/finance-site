import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BOJ_SERIES } from "./catalog";
import { parseBojResponse } from "./parser";

type Fixture = { STATUS: number; NEXTPOSITION?: number; RESULTSET: Array<{ UNIT: string; FREQUENCY: string; VALUES: { SURVEY_DATES: number[]; VALUES: Array<number | string | null> } }> };

function fixture(key: string): Fixture {
  return JSON.parse(readFileSync(join(process.cwd(), "src/lib/data/scheduler/boj/fixtures", `${key}.json`), "utf8"));
}
test("official fixtures preserve monthly/quarterly period starts and units", () => {
  for (const row of BOJ_SERIES) {
    const body = fixture(row.key);
    const parsed = parseBojResponse(body, row);
    assert.ok(parsed.points.length >= 50);
    assert.ok(parsed.points.every((p) => p.obsDate.getUTCDate() === 1));
    if (row.frequency === "QUARTERLY") assert.ok(parsed.points.every((p) => p.obsDate.getUTCMonth() % 3 === 0));
    assert.equal(parsed.points.at(-1)!.value, body.RESULTSET[0].VALUES.VALUES.at(-1));
  }
});
test("null is missing, zero and negative DI remain valid", () => {
  const row = BOJ_SERIES[7]; const body = fixture(row.key);
  body.RESULTSET[0].VALUES = { SURVEY_DATES: [202401,202402,202403], VALUES: [null,0,-3] };
  const parsed = parseBojResponse(body,row);
  assert.deepEqual(parsed.points.map((p) => [p.obsDate.toISOString().slice(0,10),p.value]), [["2024-04-01",0],["2024-07-01",-3]]);
  assert.equal(parsed.skippedInvalid,1);
});
test("fail closed on metadata drift, truncation, invalid periods, duplicate periods and bad values", () => {
  const row = BOJ_SERIES[0];
  for (const mutate of [
    (b: Fixture) => { b.STATUS = 400; },
    (b: Fixture) => { b.NEXTPOSITION = 2; },
    (b: Fixture) => { b.RESULTSET[0].UNIT = "trillion yen"; },
    (b: Fixture) => { b.RESULTSET[0].FREQUENCY = "ANNUAL(MAR)"; },
    (b: Fixture) => { b.RESULTSET[0].VALUES.SURVEY_DATES[0] = 202413; },
    (b: Fixture) => { b.RESULTSET[0].VALUES.SURVEY_DATES[0] = 299901; },
    (b: Fixture) => { b.RESULTSET[0].VALUES.SURVEY_DATES[0] = b.RESULTSET[0].VALUES.SURVEY_DATES[1]; },
    (b: Fixture) => { b.RESULTSET[0].VALUES.VALUES[0] = "NA"; },
    (b: Fixture) => { b.RESULTSET[0].VALUES.VALUES.pop(); },
  ]) {
    const body = fixture(row.key); mutate(body);
    assert.throws(() => parseBojResponse(body,row));
  }
});
