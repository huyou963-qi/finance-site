/**
 * 整表重建美国 MacroCatalogLayout（8–9 大类 + 子类），保留其他国家现有布局。
 *
 * npm run data:rebuild-us-catalog-layout
 * npm run data:rebuild-us-catalog-layout -- --dry-run
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { allItemsInGroup } from "../../src/lib/data/catalogTree";
import { buildUsCatalogLayoutCountry } from "../../src/lib/data/buildUsCatalogLayout";
import {
  applyCatalogLayout,
  loadMacroCatalogLayout,
  saveMacroCatalogLayout,
  UNASSIGNED_CATEGORY_NAME,
  type CatalogLayoutDocument,
} from "../../src/lib/data/catalogLayout";
import {
  buildBaseCatalogCountries,
  clearFredCatalogCache,
} from "../../src/lib/data/fredCatalog";

function parseArgs() {
  return { dryRun: process.argv.slice(2).includes("--dry-run") };
}

async function main() {
  const { dryRun } = parseArgs();

  const baseCountries = await buildBaseCatalogCountries();
  const usBase = baseCountries.find((c) => c.code === "US");
  if (!usBase) {
    console.error("[rebuild-us-catalog-layout] 未找到美国 base 目录");
    process.exit(1);
  }

  const usItems = usBase.categories.flatMap((cat) => allItemsInGroup(cat));
  const usLayout = buildUsCatalogLayoutCountry(usItems);

  const existing = await loadMacroCatalogLayout();
  const otherCountries = (existing?.countries ?? []).filter((c) => c.countryCode !== "US");
  const layout: CatalogLayoutDocument = {
    version: 1,
    countries: [...otherCountries, usLayout],
  };

  const unassigned =
    usLayout.categories.find((c) => c.name === UNASSIGNED_CATEGORY_NAME)?.itemKeys.length ?? 0;
  const totalKeys = usLayout.categories.reduce(
    (n, c) =>
      n +
      c.itemKeys.length +
      c.subgroups.reduce((m, sg) => m + sg.itemKeys.length, 0),
    0,
  );

  console.log(
    `[rebuild-us-catalog-layout] US 指标=${usItems.length} 布局 key=${totalKeys} 未分配=${unassigned}`,
  );
  for (const cat of usLayout.categories) {
    const subCount = cat.subgroups.reduce((n, sg) => n + sg.itemKeys.length, 0);
    const subSummary =
      cat.subgroups.length > 0
        ? ` (${cat.subgroups.map((sg) => `${sg.name}:${sg.itemKeys.length}`).join(", ")})`
        : "";
    console.log(
      `  ${cat.name}: 直接=${cat.itemKeys.length} 子类=${subCount}${subSummary}`,
    );
  }

  if (unassigned > 0) {
    const keys =
      usLayout.categories.find((c) => c.name === UNASSIGNED_CATEGORY_NAME)?.itemKeys ?? [];
    console.warn(`[rebuild-us-catalog-layout] 仍有未分配 key：\n  ${keys.join("\n  ")}`);
  }

  if (dryRun) {
    const preview = applyCatalogLayout(baseCountries, layout);
    const usAfter = preview.find((c) => c.code === "US");
    const stillUnassigned =
      usAfter?.categories.find((c) => c.name === UNASSIGNED_CATEGORY_NAME)?.items.length ?? 0;
    console.log(`[rebuild-us-catalog-layout] --dry-run：应用后未分配=${stillUnassigned}，未写入数据库`);
    return;
  }

  await saveMacroCatalogLayout(layout, "rebuild-us-catalog-layout");
  clearFredCatalogCache();
  console.log("[rebuild-us-catalog-layout] 已保存 MacroCatalogLayout（仅替换 US）");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
