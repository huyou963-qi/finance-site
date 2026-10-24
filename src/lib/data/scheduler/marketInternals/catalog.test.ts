import assert from "node:assert/strict";
import { test } from "node:test";
import { MARKET_INTERNALS_SERIES } from "./catalog";
import { RELEASE_PACKAGE_CATALOG, instrumentMatchesPackageMember } from "../releasePackageCatalog";
import { resolveGlobalCatalogPlacement } from "../../globalCatalogTaxonomy";

test("13条日频序列各自唯一归属一个每日探测包，并落到业务子目录", () => {
  for (const row of MARKET_INTERNALS_SERIES) {
    const packages = RELEASE_PACKAGE_CATALOG.filter((pkg) => instrumentMatchesPackageMember({ code: row.code, fredSeriesId: null }, pkg.members));
    assert.equal(packages.length, 1, row.code);
    assert.equal(packages[0].granularity, "DAILY");
    assert.deepEqual(packages[0].release, { type: "probe_interval", intervalHours: row.source === "french" ? 24 : 6 });
    const placement = resolveGlobalCatalogPlacement({ key: `mds:${row.code}`, countryCode: "US", label: row.name, frequency: "日", provider: "mds", categoryName: "利率与信用市场" });
    assert.equal(placement.category, "利率与信用市场");
    assert.equal(placement.subgroup, row.group);
  }
});
