import assert from "node:assert/strict";
import test from "node:test";
import { consumerStructureReusePatch } from "./consumerStructureReuse";

const next = new Date("2026-11-25T13:33:00Z");
const pkg = { id: "us.bea.personal_income", nextRunAt: next };
const base = { sourceId: "fred", sourceSeriesKey: "PCE", releasePackageId: null, revisionLookback: 3, nextRunAt: null };

test("enabled legacy FRED feed receives its package, full-history window and missing schedule", () => {
  assert.deepEqual(consumerStructureReusePatch("PCE", base, pkg), {
    releasePackageId: pkg.id, revisionLookback: 2400, nextRunAt: next,
  });
});

test("repeated seed preserves a due calendar and a longer revision window", () => {
  const due = new Date("2026-11-18T09:00:00Z");
  assert.deepEqual(consumerStructureReusePatch("PCE", { ...base, nextRunAt: due, revisionLookback: 3000 }, pkg), {
    releasePackageId: pkg.id, revisionLookback: 3000,
  });
});

test("fresh data:apply can reconcile before release-package seeding", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  assert.deepEqual(consumerStructureReusePatch("PCE", base, null, now), { revisionLookback: 2400, nextRunAt: now });
});

test("reuse rejects a different source, series identity or package owner", () => {
  for (const patch of [{ sourceId: "other" }, { sourceSeriesKey: "PCEC" }, { releasePackageId: "us.bea.gdp" }]) {
    assert.throws(() => consumerStructureReusePatch("PCE", { ...base, ...patch }, pkg), /owner conflict/);
  }
});
