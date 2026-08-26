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
  let nonFrequencyLeaf = 0;
  let misplacedFrequency = 0;
  const expectedFrequencySuffix = {
    年: "（年频）",
    季度: "（季频）",
    月: "（月频）",
    周: "（周频）",
    日: "（日频）",
  } as const;
  for (const country of preview) for (const category of country.categories) {
    if (category.name === "未分配") {
      unassigned += category.items.length;
      console.error(`[unassigned] ${country.code}: ${category.items.map((item) => `${item.key} ${item.label}`).join(" | ")}`);
    }
    if (category.items.length > 0) {
      nonFrequencyLeaf += category.items.length;
      console.error(`[mixed-frequency-direct] ${country.code} / ${category.name}: ${category.items.length}`);
    }
    for (const subgroup of category.subgroups ?? []) if (subgroup.items.length > MAX_CATALOG_LEAF_ITEMS) {
      oversized++;
      console.error(`[oversized] ${country.code} / ${category.name} / ${subgroup.name}: ${subgroup.items.length}`);
    }
    for (const subgroup of category.subgroups ?? []) {
      if (!/（[年月季周日]频）(?:·\d+)?$/.test(subgroup.name)) {
        nonFrequencyLeaf++;
        console.error(`[missing-frequency] ${country.code} / ${category.name} / ${subgroup.name}`);
      }
      for (const item of subgroup.items) {
        const suffix = expectedFrequencySuffix[item.frequency];
        if (!subgroup.name.includes(suffix)) {
          misplacedFrequency++;
          console.error(`[frequency-mismatch] ${country.code} / ${category.name} / ${subgroup.name}: ${item.key} ${item.frequency}`);
        }
      }
    }
  }
  console.log(`[rebuild-global-catalog-layout] 国家=${preview.length}，未分配=${unassigned}，超出末端上限=${oversized}，未按频率分组=${nonFrequencyLeaf}，频率错放=${misplacedFrequency}`);
  if (unassigned || oversized || nonFrequencyLeaf || misplacedFrequency) throw new Error("全局目录分类约束未满足");
  if (dryRun) return console.log("[rebuild-global-catalog-layout] --dry-run：未写入数据库");
  await saveMacroCatalogLayout(layout, "rebuild-global-catalog-layout");
  clearFredCatalogCache();
  console.log("[rebuild-global-catalog-layout] 已重建所有国家的 MacroCatalogLayout");
}
main().catch((error) => { console.error(error); process.exit(1); });
