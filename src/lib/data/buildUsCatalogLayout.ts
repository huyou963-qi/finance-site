import { randomUUID } from "@/lib/randomId";
import {
  UNASSIGNED_CATEGORY_NAME,
  type CatalogLayoutCategory,
  type CatalogLayoutCountry,
  type CatalogLayoutSubgroup,
} from "@/lib/data/catalogLayout";
import type { UnifiedCatalogItem } from "@/lib/data/fredCatalog";
import {
  resolveUsCatalogPlacement,
  US_CATALOG_SUBGROUPS,
  US_CATALOG_TOP_LEVEL,
  type UsCatalogTopLevel,
} from "@/lib/data/usCatalogTaxonomy";

type CategoryBucket = {
  direct: string[];
  subgroups: Map<string, string[]>;
};

function dedupeKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function ensureBucket(
  map: Map<string, CategoryBucket>,
  categoryName: string,
): CategoryBucket {
  const existing = map.get(categoryName);
  if (existing) return existing;
  const bucket: CategoryBucket = { direct: [], subgroups: new Map() };
  map.set(categoryName, bucket);
  return bucket;
}

function buildCategoryLayout(
  categoryName: string,
  bucket: CategoryBucket,
): CatalogLayoutCategory | null {
  const subgroupOrder =
    categoryName in US_CATALOG_SUBGROUPS
      ? US_CATALOG_SUBGROUPS[categoryName as UsCatalogTopLevel]
      : [];

  const subgroups: CatalogLayoutSubgroup[] = [];
  const usedSubgroupNames = new Set<string>();

  for (const sgName of subgroupOrder) {
    const keys = bucket.subgroups.get(sgName);
    if (!keys?.length) continue;
    subgroups.push({
      id: randomUUID(),
      name: sgName,
      itemKeys: dedupeKeys(keys),
    });
    usedSubgroupNames.add(sgName);
  }

  for (const [sgName, keys] of bucket.subgroups) {
    if (usedSubgroupNames.has(sgName) || keys.length === 0) continue;
    subgroups.push({
      id: randomUUID(),
      name: sgName,
      itemKeys: dedupeKeys(keys),
    });
  }

  const direct = dedupeKeys(bucket.direct);
  if (direct.length === 0 && subgroups.length === 0) return null;

  return {
    id: randomUUID(),
    name: categoryName,
    itemKeys: direct,
    subgroups,
  };
}

/** 按权威分类表生成美国 MacroCatalogLayout 节点 */
export function buildUsCatalogLayoutCountry(
  items: UnifiedCatalogItem[],
): CatalogLayoutCountry {
  const buckets = new Map<string, CategoryBucket>();

  for (const item of items) {
    const placement = resolveUsCatalogPlacement({
      key: item.key,
      label: item.label,
      legacyCategory: item.categoryName,
    });
    const categoryName =
      placement.category === "未分配" ? UNASSIGNED_CATEGORY_NAME : placement.category;
    const bucket = ensureBucket(buckets, categoryName);

    if (placement.subgroup) {
      const keys = bucket.subgroups.get(placement.subgroup) ?? [];
      keys.push(item.key);
      bucket.subgroups.set(placement.subgroup, keys);
    } else {
      bucket.direct.push(item.key);
    }
  }

  const categories: CatalogLayoutCategory[] = [];

  for (const top of US_CATALOG_TOP_LEVEL) {
    const bucket = buckets.get(top);
    if (!bucket) continue;
    const layout = buildCategoryLayout(top, bucket);
    if (layout) categories.push(layout);
    buckets.delete(top);
  }

  const unassigned = buckets.get(UNASSIGNED_CATEGORY_NAME);
  if (unassigned) {
    const layout = buildCategoryLayout(UNASSIGNED_CATEGORY_NAME, unassigned);
    if (layout) categories.push(layout);
    buckets.delete(UNASSIGNED_CATEGORY_NAME);
  }

  for (const [name, bucket] of buckets) {
    const layout = buildCategoryLayout(name, bucket);
    if (layout) categories.push(layout);
  }

  return { countryCode: "US", categories };
}
