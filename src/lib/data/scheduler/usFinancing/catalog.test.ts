import assert from "node:assert/strict";
import test from "node:test";
import { CP_FRED_SERIES, FINANCING_PROBE_HOURS, WITHDRAWN_DAILY_CODES } from "./catalog";
import { fredDisplayLabel } from "../../fredCatalog";
import { resolveUsCatalogPlacement } from "../../usCatalogTaxonomy";
import { RELEASE_PACKAGE_CATALOG } from "../releasePackageCatalog";

test("weekly balances only: exactly four official totals, no daily issuance subscriptions", () => {
  assert.deepEqual(CP_FRED_SERIES.map((r) => r.fredId), ["COMPUTN", "COMPAPER", "FINCPN", "ABCOMPN"]);
  assert.equal(FINANCING_PROBE_HOURS, 168);
  for (const row of CP_FRED_SERIES) {
    assert.equal(row.granularity, "WEEKLY");
    assert.equal(row.freqLabel, "周");
    assert.equal(row.unit, "十亿美元");
    assert.equal(fredDisplayLabel(row.fredId), row.displayName);
    assert.deepEqual(resolveUsCatalogPlacement({ key: `fred:${row.fredId}` }), { category: "利率与信用市场", subgroup: "商业票据发行与余额" });
    const packages = RELEASE_PACKAGE_CATALOG.filter((p) => p.members.fredSeriesIds?.includes(row.fredId));
    assert.equal(packages.length, 1);
    assert.equal(packages[0]!.id, row.releasePackageId);
    assert.deepEqual(packages[0]!.release, { type: "probe_interval", intervalHours: 168 });
  }
  for (const code of WITHDRAWN_DAILY_CODES) {
    assert.equal(RELEASE_PACKAGE_CATALOG.some((p) => p.members.instrumentCodes?.includes(code) ||
      p.members.fredSeriesIds?.includes(code.replace("sched_fred_", ""))), false);
  }
});
