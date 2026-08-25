/**
 * 非国家的数据机构统一放在所有国家之后，避免把国际来源误看成某个国家目录。
 * 国家仍优先显示美国、中国，其余国家按代码排序。
 */
const COUNTRY_PRIORITY = ["US", "CN"] as const;
const INDEPENDENT_SOURCE_PRIORITY = [
  "SRC_WORLDBANK",
  "SRC_BIS",
  "SRC_IMF",
  "SRC_WTO",
  "SRC_CFTC",
] as const;

function isIndependentSourceDirectory(code: string): boolean {
  return code.startsWith("SRC_");
}

export function compareCatalogCountryCode(a: string, b: string): number {
  const aIsSource = isIndependentSourceDirectory(a);
  const bIsSource = isIndependentSourceDirectory(b);
  if (aIsSource !== bIsSource) return aIsSource ? 1 : -1;

  if (aIsSource && bIsSource) {
    const pa = INDEPENDENT_SOURCE_PRIORITY.indexOf(
      a as (typeof INDEPENDENT_SOURCE_PRIORITY)[number],
    );
    const pb = INDEPENDENT_SOURCE_PRIORITY.indexOf(
      b as (typeof INDEPENDENT_SOURCE_PRIORITY)[number],
    );
    if (pa >= 0 && pb >= 0) return pa - pb;
    if (pa >= 0) return -1;
    if (pb >= 0) return 1;
    return a.localeCompare(b, "zh-CN");
  }

  const pa = COUNTRY_PRIORITY.indexOf(a as (typeof COUNTRY_PRIORITY)[number]);
  const pb = COUNTRY_PRIORITY.indexOf(b as (typeof COUNTRY_PRIORITY)[number]);
  if (pa >= 0 && pb >= 0) return pa - pb;
  if (pa >= 0) return -1;
  if (pb >= 0) return 1;
  return a.localeCompare(b, "zh-CN");
}

export function sortByCatalogCountryCode<T>(items: T[], getCode: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareCatalogCountryCode(getCode(a), getCode(b)));
}
