/**
 * Verify COT entries appear in unified catalog
 * npx tsx scripts/research/verify-cot-catalog.ts
 */
import { loadEnvConfig } from "@next/env";
import { clearFredCatalogCache, getFredCatalogCached } from "../../src/lib/data/fredCatalog";

loadEnvConfig(process.cwd());

async function main() {
  clearFredCatalogCache();
  const { countries, allowlist } = await getFredCatalogCached();
  const us = countries.find((c) => c.code === "US");
  const cotCat = us?.categories.find((c) => c.name === "CFTC数据");
  console.log("US categories:", us?.categories.map((c) => `${c.name}(${c.items.length})`).join(", "));
  console.log("CFTC数据 items:", cotCat?.items.length ?? 0);
  console.log("sample:", cotCat?.items.slice(0, 3).map((i) => `${i.key} → ${i.label}`));
  const gold = cotCat?.items.filter((i) => i.key.includes("gold"));
  console.log("gold keys:", gold?.map((i) => i.key));
  const inAllow = [...allowlist].filter((k) => k.startsWith("mds:cot_mm_"));
  console.log("allowlist cot count:", inAllow.length);
}

main().catch(console.error);
