import assert from "node:assert/strict";
import test from "node:test";
import { officialEuropeProbeHours } from "./catalog";
import { RELEASE_PACKAGE_CATALOG } from "../releasePackageCatalog";

test("GDP and industrial country revisions are polled independently of aggregate release dates", () => {
  for (const id of ["eu.eurostat.gdp", "eu.eurostat.industrial_production"]) {
    assert.equal(officialEuropeProbeHours(id), 24);
    const pkg = RELEASE_PACKAGE_CATALOG.find((p) => p.id === id)!;
    assert.deepEqual(pkg.release, { type: "probe_interval", intervalHours: 24 });
  }
  assert.equal(officialEuropeProbeHours("eu.eurostat.hicp"), 6);
  assert.equal(officialEuropeProbeHours("eu.ecb.key_rates"), 6);
  assert.equal(officialEuropeProbeHours("eu.eurostat.retail_trade"), null);
});
