import assert from "node:assert/strict";
import test from "node:test";
import { resolveGlobalCatalogPlacement, MAX_CATALOG_LEAF_ITEMS } from "./globalCatalogTaxonomy";
import type { UnifiedCatalogItem } from "./fredCatalog";
import { MOF_BUDGET_ACCOUNTS_SERIES } from "./scheduler/mofBudgetAccounts/catalog";
import { RELEASE_PACKAGE_CATALOG, instrumentMatchesPackageMember } from "./scheduler/releasePackageCatalog";

test("four-budget annual accounts have exclusive package and bounded business leaves", () => {
  const groups = new Map<string, number>();
  for (const series of MOF_BUDGET_ACCOUNTS_SERIES) {
    const placement = resolveGlobalCatalogPlacement({ key: `mds:${series.code}`, label: series.name, frequency: "年", countryCode: "CN", provider: "mds" } as UnifiedCatalogItem);
    assert.equal(placement.category, "财政与公共债务");
    assert(placement.subgroup.startsWith(series.account === "capital" ? "国资预算：" : "社保基金："));
    groups.set(placement.subgroup, (groups.get(placement.subgroup) ?? 0) + 1);
    const packages = RELEASE_PACKAGE_CATALOG.filter((pkg) => instrumentMatchesPackageMember({ code: series.code, fredSeriesId: null }, pkg.members));
    assert.deepEqual(packages.map((pkg) => pkg.id), ["cn.mof.budget_accounts_final"]);
  }
  assert([...groups.values()].every((size) => size <= MAX_CATALOG_LEAF_ITEMS));
});

test("monthly and annual MOF reports probe official archives at distinct cadences", () => {
  assert.deepEqual(RELEASE_PACKAGE_CATALOG.find((p) => p.id === "cn.mof.fiscal")?.release, { type: "probe_interval", intervalHours: 24 });
  assert.deepEqual(RELEASE_PACKAGE_CATALOG.find((p) => p.id === "cn.mof.budget_accounts_final")?.release, { type: "probe_interval", intervalHours: 168 });
});
