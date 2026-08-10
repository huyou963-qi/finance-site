import assert from "node:assert/strict";
import test from "node:test";
import { calculateBlsPpiYoy, parseBlsMonthlyIndex } from "./blsPpiAdapter";

test("BLS PPI parser reads monthly NSA indexes and derives year-over-year values", () => {
  const points = parseBlsMonthlyIndex({
    Results: {
      series: [
        {
          data: [
            { year: "2025", period: "M01", value: "200" },
            { year: "2024", period: "M01", value: "190" },
            { year: "2025", period: "M13", value: "999" },
          ],
        },
      ],
    },
  });
  assert.deepEqual(points.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]), [
    ["2024-01-31", 190],
    ["2025-01-31", 200],
  ]);
  assert.deepEqual(calculateBlsPpiYoy(points), [
    { obsDate: new Date("2025-01-31T00:00:00.000Z"), value: (200 / 190 - 1) * 100 },
  ]);
});
