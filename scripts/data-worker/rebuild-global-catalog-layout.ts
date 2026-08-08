import { loadEnvConfig } from "@next/env";
import { buildGlobalCatalogLayout, MAX_CATALOG_LEAF_ITEMS } from "../../src/lib/data/globalCatalogTaxonomy";
import { applyCatalogLayout, saveMacroCatalogLayout, type CatalogLayoutDocument } from "../../src/lib/data/catalogLayout";
import { buildBaseCatalogCountries, clearFredCatalogCache } from "../../src/lib/data/fredCatalog";

loadEnvConfig(process.cwd());

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const base = await buildBaseCatalogCountries();
  const layout: CatalogLayoutDocument = { version: 1, countries: buildGlobalCatalogLayout(base) };
  const preview = applyCatalogLayout(base, layout);
  let unassigned = 0;
  let oversized = 0;
  for (const country of preview) for (const category of country.categories) {
    if (category.name === "未分配") {
      unassigned += category.items.length;
      console.error(`[unassigned] ${country.code}: ${category.items.map((item) => `${item.key} ${item.label}`).join(" | ")}`);
    }
    for (const subgroup of category.subgroups ?? []) if (subgroup.items.length > MAX_CATALOG_LEAF_ITEMS) {
      oversized++;
      console.error(`[oversized] ${country.code} / ${category.name} / ${subgroup.name}: ${subgroup.items.length}`);
    }
  }
  console.log(`[rebuild-global-catalog-layout] 国家=${preview.length}，未分配=${unassigned}，超出末端上限=${oversized}`);
  if (unassigned || oversized) throw new Error("全局目录分类约束未满足");
  if (dryRun) return console.log("[rebuild-global-catalog-layout] --dry-run：未写入数据库");
  await saveMacroCatalogLayout(layout, "rebuild-global-catalog-layout");
  clearFredCatalogCache();
  console.log("[rebuild-global-catalog-layout] 已重建所有国家的 MacroCatalogLayout");
}
main().catch((error) => { console.error(error); process.exit(1); });
