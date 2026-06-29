/**
 * Verify CPI consolidation in unified catalog
 * npx tsx scripts/research/verify-cpi-catalog-tree.ts
 */
import { loadEnvConfig } from "@next/env";
import { clearFredCatalogCache, getFredCatalogCached } from "../../src/lib/data/fredCatalog";
import { isLegacyCpiCategoryName } from "../../src/lib/data/catalogTree";

loadEnvConfig(process.cwd());

async function main() {
  clearFredCatalogCache();
  const { countries } = await getFredCatalogCached();
  const us = countries.find((c) => c.code === "US");
  if (!us) throw new Error("no US");

  const legacy = us.categories.filter((c) => isLegacyCpiCategoryName(c.name));
  console.log("US legacy CPI categories (should be 0):", legacy.map((c) => c.name));

  const price = us.categories.find((c) => c.name === "价格指数");
  const cpi = price?.subgroups?.find((s) => s.name === "CPI");
  console.log("US 价格指数 direct items:", price?.items.length ?? 0);
  console.log("US 价格指数 / CPI items:", cpi?.items.length ?? 0);
  console.log("CPI sample:", cpi?.items.slice(0, 4).map((i) => i.label));

  for (const code of ["CN", "JP", "DE"]) {
    const c = countries.find((x) => x.code === code);
    const p = c?.categories.find((x) => x.name === "价格指数");
    const sg = p?.subgroups?.find((x) => x.name === "CPI");
    console.log(`${code} 价格指数/CPI:`, sg?.items.length ?? 0, "direct:", p?.items.length ?? 0);
  }
}

main().catch(console.error);
