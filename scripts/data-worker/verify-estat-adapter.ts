/** Offline regression: official sanitized CPI response plus intentional schema corruption. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseEStatObservations, parseEStatTimeLabel, type EStatSelection } from "../../src/lib/data/scheduler/adapters/eStatAdapter";
import { redactEStatResponse } from "../../src/lib/data/scheduler/eStat/client";

const fixture = JSON.parse(fs.readFileSync("scripts/data-worker/fixtures/jp-estat-cpi/national-all.json", "utf8"));
const selection: EStatSelection = { statsDataId: "0004052037", filters: { cdTab: "1", cdCat01: "0001", cdArea: "00000" }, frequency: "M" };
const points = parseEStatObservations(fixture, selection);
assert.ok(points.length > 600);
assert.equal(points[0].obsDate.toISOString().slice(0,10), "1970-01-01");
assert.equal(points[0].value, 27);
assert.equal(points.at(-1)!.obsDate.toISOString().slice(0,10), "2026-07-01");
assert.equal(points.at(-1)!.value, 102);
assert.equal(parseEStatTimeLabel("2025年度"), null);
assert.equal(parseEStatTimeLabel("2026年13月"), null);
assert.equal(parseEStatTimeLabel("2026年7～9月")?.frequency, "Q");
assert.ok(parseEStatObservations(fixture, { ...selection, historyStart: "2018-01-01" }).every(p => p.obsDate.getUTCFullYear() >= 2018));
assert.throws(() => parseEStatObservations(fixture));
assert.throws(() => parseEStatObservations(fixture, { ...selection, expectedUnit: "%" }));
for (const corrupt of [
  (f: typeof fixture) => { f.GET_STATS_DATA.RESULT.STATUS = 100; },
  (f: typeof fixture) => { f.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE[0]["@area"] = "13100"; },
  (f: typeof fixture) => { f.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE.push(f.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE.find((r: Record<string,string>) => r["@time"] === "2026000707")); },
  (f: typeof fixture) => { f.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE[0]["@time"] = "bad"; },
]) { const f = structuredClone(fixture); corrupt(f); assert.throws(() => parseEStatObservations(f, selection)); }
const redacted = JSON.stringify(redactEStatResponse({ PARAMETER: { APP_ID: "secret", nested: "reflected secret" } }, "secret"));
assert.ok(!redacted.includes("secret") && !redacted.includes("APP_ID"));
console.log(`e-Stat adapter passed: ${points.length} official monthly observations; mixed dimensions, units, duplicate dates, API error and secret reflection rejected.`);
