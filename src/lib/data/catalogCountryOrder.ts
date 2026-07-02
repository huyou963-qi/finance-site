/** 目录树国家顺序：美国 → 中国 → 其余按代码 */
const CATALOG_COUNTRY_PRIORITY = ["US", "CN"] as const;

export function compareCatalogCountryCode(a: string, b: string): number {
  const pa = CATALOG_COUNTRY_PRIORITY.indexOf(a as (typeof CATALOG_COUNTRY_PRIORITY)[number]);
  const pb = CATALOG_COUNTRY_PRIORITY.indexOf(b as (typeof CATALOG_COUNTRY_PRIORITY)[number]);
  if (pa >= 0 && pb >= 0) return pa - pb;
  if (pa >= 0) return -1;
  if (pb >= 0) return 1;
  return a.localeCompare(b, "zh-CN");
}

export function sortByCatalogCountryCode<T>(items: T[], getCode: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareCatalogCountryCode(getCode(a), getCode(b)));
}
