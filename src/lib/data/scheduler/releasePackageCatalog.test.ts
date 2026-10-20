import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RELEASE_PACKAGE_CATALOG,
  RETIRED_RELEASE_PACKAGE_IDS,
  instrumentMatchesPackageMember,
} from "./releasePackageCatalog";
import { officialEuropeProbeHours } from "./europeCore/catalog";
import { ZILLOW_ZORI_PROBE_HOURS, zillowSeedNextRunAt } from "./zillowZori/catalog";

test("Zillow repeated deployment never postpones a due or sooner fetch", () => {
  const now = new Date("2026-10-15T08:00:00Z");
  const overdue = new Date("2026-10-15T07:00:00Z");
  const soon = new Date("2026-10-15T10:00:00Z");
  assert.equal(zillowSeedNextRunAt(overdue, now), overdue);
  assert.equal(zillowSeedNextRunAt(soon, now), soon);
  assert.equal(zillowSeedNextRunAt(null, now).toISOString(), "2026-10-15T20:00:00.000Z");
  assert.equal(zillowSeedNextRunAt(new Date("2026-10-18"), now).toISOString(), "2026-10-15T20:00:00.000Z");
});

test("Zillow CPI proxy probes SA history twice daily, CPI actuals retain their release package", () => {
  assert.equal(ZILLOW_ZORI_PROBE_HOURS, 12);
  assert.deepEqual(RELEASE_PACKAGE_CATALOG.find((p) => p.id === "us.zillow.zori")?.release,
    { type: "probe_interval", intervalHours: ZILLOW_ZORI_PROBE_HOURS });
  for (const fredSeriesId of ["CUSR0000SEHA", "CUSR0000SEHC"]) {
    const packages = RELEASE_PACKAGE_CATALOG.filter((p) => instrumentMatchesPackageMember({ code: `sched_fred_${fredSeriesId}`, fredSeriesId }, p.members));
    assert.deepEqual(packages.map((p) => p.id), ["us.bls.cpi"]);
  }
});

test("ECB daily levels are polled between policy meetings; monthly M3 retains calendar", () => {
  const policy = RELEASE_PACKAGE_CATALOG.find((pkg) => pkg.id === "eu.ecb.key_rates")!;
  assert.deepEqual(policy.release, { type: "probe_interval", intervalHours: 6 });
  assert.equal(officialEuropeProbeHours(policy.id), 6);
  assert.equal(officialEuropeProbeHours("eu.ecb.monetary_aggregates"), null);
  assert.equal(RELEASE_PACKAGE_CATALOG.find((pkg) => pkg.id === "eu.ecb.monetary_aggregates")?.release.type, "economic_calendar");
});

test("Eurostat HICP/unemployment probe original API instead of ambiguous TE calendar", () => {
  for (const id of ["eu.eurostat.hicp", "eu.eurostat.unemployment"]) {
    assert.deepEqual(RELEASE_PACKAGE_CATALOG.find((p)=>p.id===id)?.release,{type:"probe_interval",intervalHours:6});
  }
});

test("headline and core PCE share one release package", () => {
  const headline = { code: "sched_fred_PCEPI", fredSeriesId: "PCEPI" };
  const core = { code: "sched_fred_PCEPILFE", fredSeriesId: "PCEPILFE" };
  const packages = RELEASE_PACKAGE_CATALOG.filter((pkg) =>
    instrumentMatchesPackageMember(headline, pkg.members) ||
    instrumentMatchesPackageMember(core, pkg.members)
  );
  assert.deepEqual(packages.map((pkg) => pkg.id), ["us.bea.pce"]);
  assert.ok(RETIRED_RELEASE_PACKAGE_IDS.includes("us.bea.core_pce"));
});
