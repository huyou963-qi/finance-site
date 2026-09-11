import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEStatObservations, parseEStatTimeLabel, type EStatSelection } from "./eStatAdapter";
import { redactEStatResponse } from "../eStat/client";

type Fixture = {
  GET_STATS_DATA: {
    RESULT: { STATUS: number };
    STATISTICAL_DATA: { DATA_INF: { VALUE: Array<Record<string, string>> } };
  };
};

function fixture(): Fixture {
  return JSON.parse(readFileSync(join(process.cwd(), "scripts/data-worker/fixtures/jp-estat-cpi/national-all.json"), "utf8")) as Fixture;
}

const selection: EStatSelection = {
  statsDataId: "0004052037",
  filters: { cdTab: "1", cdCat01: "0001", cdArea: "00000" },
  frequency: "M",
};

test("parses the sanitized official 2025-base CPI series by metadata labels", () => {
  const points = parseEStatObservations(fixture(), selection);
  assert.equal(points.length, 679);
  assert.deepEqual([points[0]!.obsDate.toISOString().slice(0, 10), points[0]!.value], ["1970-01-01", 27]);
  assert.deepEqual([points.at(-1)!.obsDate.toISOString().slice(0, 10), points.at(-1)!.value], ["2026-07-01", 102]);
  assert.equal(parseEStatTimeLabel("2025年度"), null);
  assert.equal(parseEStatTimeLabel("2026年7～9月")?.frequency, "Q");
});

test("fails closed on missing selection, dimension drift, unit drift and duplicates", () => {
  assert.throws(() => parseEStatObservations(fixture()));
  assert.throws(() => parseEStatObservations(fixture(), { ...selection, expectedUnit: "%" }));
  const wrongArea = fixture();
  wrongArea.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE[0]!["@area"] = "13100";
  assert.throws(() => parseEStatObservations(wrongArea, selection));
  const duplicate = fixture();
  duplicate.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE.push({ ...duplicate.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE[0]! });
  assert.throws(() => parseEStatObservations(duplicate, selection));
});

test("removes reflected application credentials before archival", () => {
  const serialized = JSON.stringify(redactEStatResponse({ PARAMETER: { APP_ID: "secret", nested: "reflected secret" } }, "secret"));
  assert(!serialized.includes("secret"));
  assert(!serialized.includes("APP_ID"));
});
