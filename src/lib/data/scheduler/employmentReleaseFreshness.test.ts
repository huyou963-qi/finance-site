import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expectedEmploymentObservationMonth,
  hasEmploymentReleaseObservation,
} from "./employmentReleaseFreshness";

test("BLS October release requires September PAYEMS even when FRED still returns August", () => {
  const release = new Date("2026-10-02T12:30:00Z");
  assert.equal(
    expectedEmploymentObservationMonth("us.bls.employment_situation", release)?.toISOString(),
    "2026-09-01T00:00:00.000Z",
  );
  assert.equal(hasEmploymentReleaseObservation("us.bls.employment_situation", release, new Date("2026-08-01")), false);
  assert.equal(hasEmploymentReleaseObservation("us.bls.employment_situation", release, new Date("2026-09-01")), true);
});

test("ADP September 30 release requires September while November 4 requires October", () => {
  assert.equal(
    expectedEmploymentObservationMonth("us.adp.ner", new Date("2026-09-30T12:30:00Z"))?.toISOString(),
    "2026-09-01T00:00:00.000Z",
  );
  assert.equal(
    expectedEmploymentObservationMonth("us.adp.ner", new Date("2026-11-04T13:30:00Z"))?.toISOString(),
    "2026-10-01T00:00:00.000Z",
  );
});
