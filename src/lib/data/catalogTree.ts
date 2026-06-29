import type {
  UnifiedCatalogCountry,
  UnifiedCatalogGroup,
  UnifiedCatalogItem,
  UnifiedCatalogSubgroup,
} from "./fredCatalog";

export const PRICE_INDEX_CATEGORY = "价格指数";
export const CPI_SUBGROUP = "CPI";

/** 原 FRED 目录里独立的 CPI 子分类（合并进 价格指数 → CPI） */
const CPI_LEGACY_CATEGORY_RE = /^CPI(\s|$)/;

export function isLegacyCpiCategoryName(name: string): boolean {
  return CPI_LEGACY_CATEGORY_RE.test(name.trim());
}

/** 是否归入 价格指数 / CPI 子层 */
export function shouldAssignCpiSubgroup(label: string, key: string): boolean {
  const text = `${label} ${key}`.toUpperCase();
  if (/\bCPI\b/.test(text) || text.includes("CPIAUCSL") || text.includes("CPILFESL")) {
    return true;
  }
  if (/^FRED:(CPI|CUSR0000|CPIL)/i.test(key)) return true;
  if (/CPI/i.test(key) && /(YOY|MOM|同比|环比)/i.test(label)) return true;
  if (/^MDS:.*_CPI_/i.test(key) || /^MDS:USOV_C\d+_CPI/i.test(key)) return true;
  if (/^MDS:CHOV_.*CPI/i.test(key) || /^MDS:JPOV_.*CPI/i.test(key)) return true;
  if (key === "wb:US:FP.CPI.TOTL.ZG" || /:FP\.CPI\./i.test(key)) return true;
  return false;
}

function dedupeItems(items: UnifiedCatalogItem[]): UnifiedCatalogItem[] {
  return [...new Map(items.map((i) => [i.key, i])).values()].sort((a, b) =>
    a.label.localeCompare(b.label, "zh-CN"),
  );
}

function mergeSubgroups(
  a: UnifiedCatalogSubgroup[] | undefined,
  b: UnifiedCatalogSubgroup[] | undefined,
): UnifiedCatalogSubgroup[] | undefined {
  const map = new Map<string, UnifiedCatalogItem[]>();
  for (const sg of [...(a ?? []), ...(b ?? [])]) {
    const arr = map.get(sg.name) ?? [];
    arr.push(...sg.items);
    map.set(sg.name, arr);
  }
  if (map.size === 0) return undefined;
  return [...map.entries()]
    .map(([name, items]) => ({ name, items: dedupeItems(items) }))
    .sort((x, y) => x.name.localeCompare(y.name, "zh-CN"));
}

export function mergeCatalogGroups(a: UnifiedCatalogGroup, b: UnifiedCatalogGroup): UnifiedCatalogGroup {
  return {
    name: a.name,
    items: dedupeItems([...a.items, ...b.items]),
    subgroups: mergeSubgroups(a.subgroups, b.subgroups),
  };
}

export function allItemsInGroup(group: UnifiedCatalogGroup): UnifiedCatalogItem[] {
  const sub = (group.subgroups ?? []).flatMap((s) => s.items);
  return [...group.items, ...sub];
}

export function countItemsInCountry(country: UnifiedCatalogCountry): number {
  return country.categories.reduce((n, c) => n + allItemsInGroup(c).length, 0);
}

/** 将 CPI 相关分类并入 价格指数 → CPI */
export function consolidatePriceIndexCpi(country: UnifiedCatalogCountry): UnifiedCatalogCountry {
  const cpiItems: UnifiedCatalogItem[] = [];
  const otherCategories: UnifiedCatalogGroup[] = [];
  let priceIndex: UnifiedCatalogGroup | null = null;

  for (const cat of country.categories) {
    if (isLegacyCpiCategoryName(cat.name)) {
      cpiItems.push(...allItemsInGroup(cat));
      continue;
    }
    if (cat.name === PRICE_INDEX_CATEGORY) {
      const direct: UnifiedCatalogItem[] = [];
      const fromSubCpi: UnifiedCatalogItem[] = [];
      for (const item of cat.items) {
        if (shouldAssignCpiSubgroup(item.label, item.key)) fromSubCpi.push(item);
        else direct.push(item);
      }
      for (const sg of cat.subgroups ?? []) {
        if (sg.name === CPI_SUBGROUP) fromSubCpi.push(...sg.items);
        else {
          for (const item of sg.items) {
            if (shouldAssignCpiSubgroup(item.label, item.key)) fromSubCpi.push(item);
            else direct.push(item);
          }
        }
      }
      cpiItems.push(...fromSubCpi);
      priceIndex = {
        name: PRICE_INDEX_CATEGORY,
        items: direct,
        subgroups: (cat.subgroups ?? []).filter((s) => s.name !== CPI_SUBGROUP),
      };
      if (priceIndex.subgroups?.length === 0) priceIndex.subgroups = undefined;
      continue;
    }
    otherCategories.push(cat);
  }

  if (cpiItems.length > 0 || priceIndex) {
    const base = priceIndex ?? { name: PRICE_INDEX_CATEGORY, items: [] };
    const subgroups = mergeSubgroups(base.subgroups, [
      { name: CPI_SUBGROUP, items: dedupeItems(cpiItems) },
    ]);
    otherCategories.push({
      name: PRICE_INDEX_CATEGORY,
      items: base.items,
      subgroups,
    });
  }

  otherCategories.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return { ...country, categories: otherCategories };
}

export function catalogCategoryPath(
  categoryName: string,
  subgroupName?: string | null,
): string {
  return subgroupName ? `${categoryName} / ${subgroupName}` : categoryName;
}

export function categoryTreeKey(
  countryCode: string,
  categoryName: string,
  subgroupName?: string | null,
): string {
  return subgroupName
    ? `${countryCode}:${categoryName}:${subgroupName}`
    : `${countryCode}:${categoryName}`;
}

export type CatalogIndicatorPath = {
  countryCode: string;
  categoryName: string;
  subgroupName: string | null;
};

export function findIndicatorPath(
  countries: UnifiedCatalogCountry[],
  key: string,
): CatalogIndicatorPath | null {
  for (const country of countries) {
    for (const category of country.categories) {
      for (const item of category.items) {
        if (item.key === key) {
          return {
            countryCode: country.code,
            categoryName: category.name,
            subgroupName: null,
          };
        }
      }
      for (const subgroup of category.subgroups ?? []) {
        for (const item of subgroup.items) {
          if (item.key === key) {
            return {
              countryCode: country.code,
              categoryName: category.name,
              subgroupName: subgroup.name,
            };
          }
        }
      }
    }
  }
  return null;
}

export function filterUnifiedCatalogCountry(
  country: UnifiedCatalogCountry,
  needle: string,
): UnifiedCatalogCountry {
  const q = needle.trim().toLowerCase();
  if (!q) return country;

  const matchCountry =
    country.name.toLowerCase().includes(q) || country.code.toLowerCase().includes(q);

  const categories = country.categories
    .map((category) => {
      const matchCategory = category.name.toLowerCase().includes(q);
      const items = category.items.filter(
        (item) =>
          matchCountry ||
          matchCategory ||
          item.label.toLowerCase().includes(q) ||
          item.key.toLowerCase().includes(q),
      );
      const subgroups = (category.subgroups ?? [])
        .map((sg) => {
          const matchSubgroup = sg.name.toLowerCase().includes(q);
          const sgItems = sg.items.filter(
            (item) =>
              matchCountry ||
              matchCategory ||
              matchSubgroup ||
              item.label.toLowerCase().includes(q) ||
              item.key.toLowerCase().includes(q),
          );
          return { ...sg, items: sgItems };
        })
        .filter((sg) => sg.items.length > 0);
      return { ...category, items, subgroups: subgroups.length ? subgroups : undefined };
    })
    .filter((c) => c.items.length > 0 || (c.subgroups?.length ?? 0) > 0);

  return { ...country, categories };
}
