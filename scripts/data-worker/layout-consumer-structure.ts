/** Targeted reconciliation with the existing nine-theme taxonomy; never replace unrelated layout. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient, Prisma } from "@prisma/client";
import { buildBaseCatalogCountries, fredCatalogBaseKey } from "../../src/lib/data/fredCatalog";
import { buildGlobalCatalogLayout } from "../../src/lib/data/globalCatalogTaxonomy";
import type { CatalogLayoutDocument } from "../../src/lib/data/catalogLayout";
import { CONSUMER_MONITOR_SELECTED_IDS } from "../../src/lib/data/scheduler/consumerStructureCatalog";
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  const stored = await db.macroCatalogLayout.findUniqueOrThrow({ where: { id: "default" } });
  const layout = structuredClone(stored.layout) as unknown as CatalogLayoutDocument;
  const expected = buildGlobalCatalogLayout(await buildBaseCatalogCountries());
  const keys = new Set(CONSUMER_MONITOR_SELECTED_IDS.map(id => `fred:${id}`));
  const us = layout.countries.find(c => c.countryCode === "US")!;
  assert.ok(us);
  for (const category of us.categories) {
    category.itemKeys = category.itemKeys.filter(k => !keys.has(fredCatalogBaseKey(k)));
    for (const group of category.subgroups) group.itemKeys = group.itemKeys.filter(k => !keys.has(fredCatalogBaseKey(k)));
  }
  let assigned = 0;
  for (const category of expected.find(c => c.countryCode === "US")!.categories) for (const group of category.subgroups) {
    const additions = group.itemKeys.filter(k => keys.has(fredCatalogBaseKey(k)));
    if (!additions.length) continue;
    let target = us.categories.find(c => c.name === category.name);
    if (!target) { target = { id: randomUUID(), name: category.name, itemKeys: [], subgroups: [] }; us.categories.push(target); }
    let leaf = target.subgroups.find(g => g.name === group.name);
    if (!leaf) { leaf = { id: randomUUID(), name: group.name, itemKeys: [] }; target.subgroups.push(leaf); }
    leaf.itemKeys.push(...additions);
    assert.ok(leaf.itemKeys.length <= 48, `${group.name}: exceeds 48`);
    assigned += additions.length;
    console.log(`${category.name} > ${group.name}: ${additions.join(",")}`);
  }
  assert.equal(assigned, keys.size);
  if (!process.argv.includes("--apply")) { console.log("[layout-consumer-structure] dry run; add --apply"); return; }
  // Optimistic lock: a concurrent administrator layout edit must never be overwritten.
  const result = await db.macroCatalogLayout.updateMany({ where: { id: stored.id, updatedAt: stored.updatedAt },
    data: { layout: layout as unknown as Prisma.InputJsonValue, updatedBy: "consumer-monitor-selected-22" } });
  assert.equal(result.count, 1, "目录已被并发编辑，请重新读取后重试");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
