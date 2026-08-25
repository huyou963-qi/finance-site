import assert from "node:assert/strict";
import test from "node:test";
import { parseImfIlGoldResponse } from "./imfIlGoldAdapter";

test("parses only the official IMF IL world gold-volume monthly series", () => {
  const values = Array.from({ length: 500 }, (_, index) => ({
    value: `${1984 + Math.floor(index / 12)}-M${String((index % 12) + 1).padStart(2, "0")}`,
  }));
  const observations = Object.fromEntries(
    values.map((_, index) => [String(index), [String(1_000_000_000 + index)]]),
  );
  const points = parseImfIlGoldResponse({
    data: {
      dataSets: [{ structure: 0, series: { "0:0:0:0": { observations } } }],
      structures: [{
        dimensions: {
          series: [
            { id: "COUNTRY", values: [{ id: "G001" }] },
            { id: "INDICATOR", values: [{ id: "RGV_REVS" }] },
            { id: "UNIT", values: [{ id: "FTO" }] },
            { id: "FREQUENCY", values: [{ id: "M" }] },
          ],
          observation: [{ id: "TIME_PERIOD", values }],
        },
      }],
    },
  });

  assert.equal(points.length, 500);
  assert.equal(points[0]?.obsDate.toISOString().slice(0, 10), "1984-01-31");
  assert.equal(points[0]?.rawFineTroyOunces, 1_000_000_000);
});

test("rejects a non-world IMF series", () => {
  assert.throws(
    () => parseImfIlGoldResponse({
      data: {
        dataSets: [{ structure: 0, series: { "0": { observations: {} } } }],
        structures: [{ dimensions: { series: [{ id: "COUNTRY", values: [{ id: "US" }] }] } }],
      },
    }),
    /unexpected COUNTRY/,
  );
});
