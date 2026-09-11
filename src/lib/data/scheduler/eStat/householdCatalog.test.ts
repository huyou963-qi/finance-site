import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseEStatObservations } from "../adapters/eStatAdapter";
import {
  JP_ESTAT_HOUSEHOLD_HISTORY_START,
  JP_ESTAT_HOUSEHOLD_SERIES,
  JP_ESTAT_HOUSEHOLD_TABLE,
  buildJpEStatHouseholdMetadata,
} from "./householdCatalog";

test("household survey catalog fixes every official dimension and keeps measures nominal", () => {
  assert.equal(JP_ESTAT_HOUSEHOLD_SERIES.length, 4);
  for (const series of JP_ESTAT_HOUSEHOLD_SERIES) {
    assert.equal(series.eStat.statsDataId, JP_ESTAT_HOUSEHOLD_TABLE);
    assert.deepEqual(Object.keys(series.eStat.filters).sort(), ["cdArea", "cdCat01", "cdCat02", "cdTab"]);
    assert.equal(series.eStat.expectedUnit, "円");
    assert.equal(series.eStat.historyStart, JP_ESTAT_HOUSEHOLD_HISTORY_START);
    const metadata = buildJpEStatHouseholdMetadata(series);
    assert.equal(metadata.priceBasis, "nominal");
    assert.equal(metadata.seasonalAdjustment, "NSA");
  }
});

test("official household survey fixtures parse to complete gap-free monthly series", () => {
  for (const series of JP_ESTAT_HOUSEHOLD_SERIES) {
    const fixture = JSON.parse(readFileSync(join(process.cwd(), "scripts/data-worker/fixtures/jp-estat-household", `${series.fixtureName}.json`), "utf8"));
    const points = parseEStatObservations(fixture, series.eStat);
    assert.equal(points.length, 319);
    assert.deepEqual(
      [points[0]!.obsDate.toISOString().slice(0, 10), points.at(-1)!.obsDate.toISOString().slice(0, 10)],
      ["2000-01-01", "2026-07-01"],
    );
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]!.obsDate;
      assert.equal(points[index]!.obsDate.getTime(), Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1));
    }
  }
});
