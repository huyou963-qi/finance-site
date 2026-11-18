import test from "node:test";
import assert from "node:assert/strict";
import { resolveUsCatalogPlacement } from "./usCatalogTaxonomy";
import { resolveGlobalCatalogPlacement, buildGlobalCatalogLayout } from "./globalCatalogTaxonomy";
import { US_RETAIL_SALES_FRED_SERIES } from "./scheduler/usRetailSalesFredSeedCatalog";
import { CONSUMER_BALANCE_FRED_SERIES } from "./scheduler/consumerBalanceFredSeedCatalog";
import { SEED_CATALOG_REGISTRY, VERIFY_CATALOG_REGISTRY } from "./scheduler/seedCatalogRegistry";
import { RELEASE_PACKAGE_CATALOG } from "./scheduler/releasePackageCatalog";
import { CONSUMER_STRUCTURE_SERIES, CONSUMER_MONITOR_SELECTED_IDS } from "./scheduler/consumerStructureCatalog";
import { instrumentMatchesPackageMember } from "./scheduler/releasePackageCatalog";

test("bounded consumer structure uses four native monthly series and one existing release", () => {
  assert.equal(CONSUMER_STRUCTURE_SERIES.length, 4);
  assert.equal(new Set(CONSUMER_MONITOR_SELECTED_IDS).size, 22);
  assert.ok(SEED_CATALOG_REGISTRY["consumer-structure"]);
  assert.ok(VERIFY_CATALOG_REGISTRY["consumer-structure"]);
  for (const row of CONSUMER_STRUCTURE_SERIES) {
    assert.deepEqual(RELEASE_PACKAGE_CATALOG.filter(pkg => instrumentMatchesPackageMember({ code: "sched_fred_" + row.fredId, fredSeriesId: row.fredId }, pkg.members)).map(pkg => pkg.id), ["us.bea.personal_income"]);
    assert.deepEqual(resolveUsCatalogPlacement({ key: "fred:" + row.fredId }), { category: "国民经济", subgroup: "消费与国内需求" });
  }
});

test("existing Census retail identities belong to domestic consumption, never external trade", () => {
  for (const id of ["RSAFS", "RSXFS", ...US_RETAIL_SALES_FRED_SERIES.map(row => row.fredId)]) {
    const item = { key: `fred:${id}`, label: "Retail Trade Sales", provider: "fred" as const,
      frequency: "月" as const, countryCode: "US", categoryName: "国内贸易与消费" };
    assert.deepEqual(resolveUsCatalogPlacement(item), { category: "国民经济", subgroup: "消费与国内需求" });
    assert.deepEqual(resolveGlobalCatalogPlacement(item), { category: "国民经济", subgroup: "消费与国内需求" });
  }
});

test("existing real spending, saving and income keep one domestic-demand business group", () => {
  for (const id of ["PCEC96", "PCEDGC96", "PCESC96", "PSAVERT", "DSPIC96"]) {
    assert.deepEqual(resolveUsCatalogPlacement({ key: `fred:${id}` }), { category: "国民经济", subgroup: "消费与国内需求" });
  }
});

test("wealth, debt-service and bank delinquency retain distinct household/bank meanings", () => {
  for (const id of ["TNWBSHNO", "TDSP"]) assert.deepEqual(resolveUsCatalogPlacement({ key: `fred:${id}` }), { category: "金融条件与银行", subgroup: "居民资产负债与偿债" });
  for (const id of ["TOTALSL", "REVOLSL"]) assert.deepEqual(resolveUsCatalogPlacement({ key: `fred:${id}` }), { category: "金融条件与银行", subgroup: "居民消费信贷" });
  for (const id of ["DRCCLACBS", "CORCCACBS"]) assert.deepEqual(resolveUsCatalogPlacement({ key: `fred:${id}` }), { category: "金融条件与银行", subgroup: "资产质量" });
});

test("existing inflation and weekly-claims locations are preserved", () => {
  for (const id of ["PCEPI", "PCEPILFE"]) assert.deepEqual(resolveUsCatalogPlacement({ key: `fred:${id}` }), { category: "通胀与价格", subgroup: "PCE与PPI" });
  for (const id of ["ICSA", "CCSA"]) assert.deepEqual(resolveUsCatalogPlacement({ key: `fred:${id}` }), { category: "劳动力市场", subgroup: "周度申领" });
});

test("existing core/retail references rebuild into bounded monthly/quarterly leaves", () => {
  const data = new Map([...CONSUMER_BALANCE_FRED_SERIES, ...US_RETAIL_SALES_FRED_SERIES].map(row => [row.fredId, row]));
  const items = [...data.values()].map(row => ({ key: `fred:${row.fredId}`, label: row.displayName,
    frequency: row.granularity === "QUARTERLY" ? "季度" as const : "月" as const, provider: "fred" as const, countryCode: "US", categoryName: row.category }));
  const [layout] = buildGlobalCatalogLayout([{ code: "US", name: "美国", categories: [{ name: "原目录", items }] }]);
  const groups = layout.categories.flatMap(category => category.subgroups);
  assert.ok(groups.every(group => group.itemKeys.length <= 48));
  assert.ok(groups.every(group => /（月频）|（季频）/.test(group.name)));
  assert.equal(groups.flatMap(group => group.itemKeys).length, items.length);
});
