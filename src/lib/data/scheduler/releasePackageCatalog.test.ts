import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RELEASE_PACKAGE_CATALOG,
  RETIRED_RELEASE_PACKAGE_IDS,
  instrumentMatchesPackageMember,
} from "./releasePackageCatalog";
import { officialEuropeProbeHours } from "./europeCore/catalog";

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
