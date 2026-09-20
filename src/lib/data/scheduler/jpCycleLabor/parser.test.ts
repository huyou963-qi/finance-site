import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { JP_CYCLE_LABOR_SERIES } from "./catalog";
import { parseJpCycleLaborWorkbook } from "./parser";

const fixture = (name: string) => path.join(process.cwd(), "src/lib/data/scheduler/jpCycleLabor/fixtures", name);
const now = new Date("2026-09-30T00:00:00Z");

test("parses the three official ESRI composite indexes", async () => {
  const buffer = await readFile(fixture("esri-ci.xlsx"));
  for (const series of JP_CYCLE_LABOR_SERIES.filter((s) => s.source === "ci")) {
    const points = parseJpCycleLaborWorkbook(buffer, series, now);
    assert.equal(points.length, 499);
    assert.equal(points[0]?.obsDate.toISOString().slice(0, 10), "1985-01-01");
    assert.equal(points.at(-1)?.obsDate.toISOString().slice(0, 10), "2026-07-01");
  }
});

test("parses national seasonally adjusted unemployment and job-openings ratio", async () => {
  const unemployment = JP_CYCLE_LABOR_SERIES.find((s) => s.source === "unemployment")!;
  const jobRatio = JP_CYCLE_LABOR_SERIES.find((s) => s.source === "jobRatio")!;
  const unemploymentPoints = parseJpCycleLaborWorkbook(await readFile(fixture("lfs-unemployment.xlsx")), unemployment, now);
  const ratioPoints = parseJpCycleLaborWorkbook(await readFile(fixture("mhlw-job-ratio.xlsx")), jobRatio, now);
  assert.equal(unemploymentPoints[0]?.obsDate.toISOString().slice(0, 10), "1953-01-01");
  assert.equal(unemploymentPoints.at(-1)?.obsDate.toISOString().slice(0, 10), "2026-07-01");
  assert.equal(ratioPoints[0]?.obsDate.toISOString().slice(0, 10), "1963-01-01");
  assert.equal(ratioPoints.at(-1)?.obsDate.toISOString().slice(0, 10), "2026-07-01");
  assert.equal(ratioPoints.at(-1)?.value, 1.18);
});
