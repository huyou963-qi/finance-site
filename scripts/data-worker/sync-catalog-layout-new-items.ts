/**
 * 把新加入 fredCatalog.ts（FRED_US_ITEMS 等）的指标 key 补写进管理端持久化的
 * 目录布局（MacroCatalogLayout），归入其在 fredCatalog.ts 中定义的分类。
 *
 * 背景：/admin/data-catalog 的分类显示优先读管理员手工整理并落库的自定义布局
 * （applyCatalogLayout），布局里没有登记的 key 一律显示为「未分配」，与
 * fredCatalog.ts 里写的 category 字段无关——仅仅在 FRED_US_ITEMS 里加条目不够，
 * 还必须同步这份持久化布局，否则新指标会一直挂在「未分配」下。
 *
 * npm run data:sync-catalog-layout -- --keys=fred:EFFR,fred:DGS2,...
 * npm run data:sync-catalog-layout -- --prefix=fred: --dry-run
 *
 * 无自定义布局（DB 无 MacroCatalogLayout 记录）时，fredCatalog.ts 的分类会直接生效，
 * 本脚本无需运行（会打印提示并退出）。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { randomUUID } from "node:crypto";
import {
  buildBaseCatalogCountries,
} from "../../src/lib/data/fredCatalog";
import {
  applyCatalogLayout,
  loadMacroCatalogLayout,
  saveMacroCatalogLayout,
  type CatalogLayoutCategory,
  type CatalogLayoutCountry,
  type CatalogLayoutDocument,
} from "../../src/lib/data/catalogLayout";

function parseArgs() {
  const args = process.argv.slice(2);
  let keys: string[] = [];
  let prefix = "";
  let dryRun = false;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--keys=")) keys = a.slice("--keys=".length).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--prefix=")) prefix = a.slice("--prefix=".length).trim();
  }
  return { keys, prefix, dryRun };
}

async function main() {
  const { keys, prefix, dryRun } = parseArgs();
  if (keys.length === 0 && !prefix) {
    console.error("用法: npm run data:sync-catalog-layout -- --keys=fred:EFFR,fred:DGS2 [--dry-run]");
    console.error("  或: npm run data:sync-catalog-layout -- --prefix=fred: [--dry-run]");
    process.exit(1);
  }

  const layout = await loadMacroCatalogLayout();
  if (!layout) {
    console.log(
      "[sync-catalog-layout] 未发现自定义布局（MacroCatalogLayout 无记录）；" +
        "fredCatalog.ts 的默认分类会直接生效，无需同步。",
    );
    return;
  }

  const baseCountries = await buildBaseCatalogCountries();
  const afterLayout = applyCatalogLayout(baseCountries, layout);

  // 目标 key 集合：显式 --keys，或 base 目录中匹配 --prefix 的全部 key
  const targetKeys = new Set<string>(keys);
  if (prefix) {
    for (const country of baseCountries) {
      for (const cat of country.categories) {
        for (const item of cat.items) {
          if (item.key.startsWith(prefix)) targetKeys.add(item.key);
        }
      }
    }
  }

  // key -> { countryCode, intendedCategoryName }（来自 fredCatalog.ts 的原始分类）
  const intendedByKey = new Map<string, { countryCode: string; categoryName: string }>();
  for (const country of baseCountries) {
    for (const cat of country.categories) {
      for (const item of cat.items) {
        if (targetKeys.has(item.key)) {
          intendedByKey.set(item.key, { countryCode: country.code, categoryName: cat.name });
        }
      }
    }
  }

  // 当前（应用布局后）已归类的 key（不含「未分配」）
  const alreadyAssigned = new Set<string>();
  for (const country of afterLayout) {
    for (const cat of country.categories) {
      if (cat.name === "未分配") continue;
      for (const item of cat.items) alreadyAssigned.add(item.key);
      for (const sg of cat.subgroups ?? []) {
        for (const item of sg.items) alreadyAssigned.add(item.key);
      }
    }
  }

  const layoutCopy: CatalogLayoutDocument = {
    version: layout.version,
    countries: layout.countries.map((c) => ({
      countryCode: c.countryCode,
      categories: c.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        itemKeys: [...cat.itemKeys],
        subgroups: cat.subgroups.map((sg) => ({ id: sg.id, name: sg.name, itemKeys: [...sg.itemKeys] })),
      })),
    })),
  };
  const countryMap = new Map<string, CatalogLayoutCountry>(
    layoutCopy.countries.map((c) => [c.countryCode, c]),
  );

  let moved = 0;
  let skippedNoIntent = 0;
  let skippedAlready = 0;

  for (const key of targetKeys) {
    if (alreadyAssigned.has(key)) {
      skippedAlready++;
      continue;
    }
    const intent = intendedByKey.get(key);
    if (!intent) {
      console.error(`  ✗ ${key}：不在 base 目录中，跳过（先确认 fredCatalog.ts 是否已加此 key）`);
      skippedNoIntent++;
      continue;
    }
    let country = countryMap.get(intent.countryCode);
    if (!country) {
      country = { countryCode: intent.countryCode, categories: [] };
      layoutCopy.countries.push(country);
      countryMap.set(intent.countryCode, country);
    }
    let category: CatalogLayoutCategory | undefined = country.categories.find(
      (c) => c.name === intent.categoryName,
    );
    if (!category) {
      category = { id: randomUUID(), name: intent.categoryName, itemKeys: [], subgroups: [] };
      country.categories.push(category);
    }
    category.itemKeys.push(key);
    console.log(`  ✓ ${key} → 「${intent.categoryName}」（${intent.countryCode}）`);
    moved++;
  }

  console.log(
    `[sync-catalog-layout] 待处理=${targetKeys.size} 移入=${moved} 已归类跳过=${skippedAlready} 无 base 分类跳过=${skippedNoIntent}`,
  );

  if (moved === 0) {
    console.log("[sync-catalog-layout] 无需保存（无新增归类）");
    return;
  }

  if (dryRun) {
    console.log("[sync-catalog-layout] --dry-run：未写入数据库");
    return;
  }

  await saveMacroCatalogLayout(layoutCopy, "agent-b-sync-script");
  console.log("[sync-catalog-layout] 已保存到 MacroCatalogLayout");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
