import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RELEASE_PACKAGE_CATALOG,
  RETIRED_RELEASE_PACKAGE_IDS,
  instrumentMatchesPackageMember,
} from "./releasePackageCatalog";

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
