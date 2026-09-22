import assert from "node:assert/strict";
import test from "node:test";
import { parseEcbCsv } from "./ecbAdapter";
import { parseEurostatJsonStat, parseEurostatPeriod } from "./eurostatAdapter";

test("parseEurostatPeriod normalizes monthly and quarterly periods to period start", () => {
  assert.equal(parseEurostatPeriod("2025-07")?.toISOString(), "2025-07-01T00:00:00.000Z");
  assert.equal(parseEurostatPeriod("2025-Q3")?.toISOString(), "2025-07-01T00:00:00.000Z");
  assert.equal(parseEurostatPeriod("bad"), null);
});

test("parseEurostatJsonStat reads a single sparse time series", () => {
  const result = parseEurostatJsonStat({
    id: ["freq", "geo", "time"],
    size: [1, 1, 3],
    dimension: {
      time: { category: { index: { "2025-01": 0, "2025-02": 1, "2025-03": 2 } } },
    },
    value: { "0": 99.5, "2": 101.25 },
  });
  assert.deepEqual(result.points.map((point) => [point.obsDate.toISOString().slice(0, 10), point.value]), [
    ["2025-01-01", 99.5],
    ["2025-03-01", 101.25],
  ]);
  assert.equal(result.sourceLatestObsDate?.toISOString().slice(0, 10), "2025-03-01");
});

test("parseEcbCsv handles quoted commas and skips empty observations", () => {
  const result = parseEcbCsv([
    "KEY,TIME_PERIOD,OBS_VALUE,TITLE_COMPL",
    'FM.D,2025-01-01,3.25,"Rate, provided by ECB"',
    'FM.D,2025-01-02,,"Rate, provided by ECB"',
    'FM.D,2025-01-03,3.5,"Rate, provided by ECB"',
  ].join("\r\n"));
  assert.deepEqual(result.points.map((point) => point.value), [3.25, 3.5]);
  assert.equal(result.sourceLatestObsDate?.toISOString().slice(0, 10), "2025-01-03");
});
