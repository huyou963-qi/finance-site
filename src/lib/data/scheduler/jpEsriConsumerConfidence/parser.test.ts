import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { JP_ESRI_CONSUMER_CONFIDENCE_SERIES } from "./catalog";
import { parseJpEsriConsumerConfidenceWorkbook } from "./parser";

const fixture = path.join(
  process.cwd(),
  "src/lib/data/scheduler/jpEsriConsumerConfidence/fixtures/shouhi2.xlsx",
);

test("parses all five ESRI consumer confidence SA level series", async () => {
  const buffer = await readFile(fixture);
  for (const series of JP_ESRI_CONSUMER_CONFIDENCE_SERIES) {
    const points = parseJpEsriConsumerConfidenceWorkbook(
      buffer,
      series,
      new Date("2026-09-30T00:00:00Z"),
    );
    assert.equal(points.length, 357);
    assert.equal(points[0]?.obsDate.toISOString().slice(0, 10), "1982-06-01");
    assert.equal(points.at(-1)?.obsDate.toISOString().slice(0, 10), "2026-08-01");
  }
});

test("rejects a workbook after the selected series column disappears", async () => {
  const buffer = await readFile(fixture);
  const invalid = { ...JP_ESRI_CONSUMER_CONFIDENCE_SERIES[0], column: 16 };
  assert.throws(
    () =>
      parseJpEsriConsumerConfidenceWorkbook(
        buffer,
        invalid,
        new Date("2026-09-30T00:00:00Z"),
      ),
    /column missing/,
  );
});
