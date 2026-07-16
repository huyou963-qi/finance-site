import type {
  UnifiedCatalogCountry,
  UnifiedCatalogGroup,
  UnifiedCatalogItem,
  UnifiedCatalogSubgroup,
} from "./fredCatalog";
import { fredIdFromCatalogKey } from "./usCatalogTaxonomy";

export const PRICE_INDEX_CATEGORY = "价格指数";
/** 美国目录合并 CPI 子层时使用的大类名 */
export const US_INFLATION_CATEGORY = "通胀与价格";
export const CPI_SUBGROUP = "CPI";
/** 美国 CPI 细分项子层（电力/汽油/家庭食品等）——与主口径「CPI」分开陈列 */
export const CPI_SUBITEMS_SUBGROUP = "CPI 分项";

/**
 * CPI 主口径 id：总量、三分法（能源/食品）、核心、核心商品/服务、住房/OER。
 * 归入「CPI」子层；其余 CPI 细分项归入「CPI 分项」子层。
 */
const CPI_AGGREGATE_IDS = new Set(
  [
    "CPIAUCSL",
    "CPILFESL",
    "CPIENGSL",
    "CPIFABSL",
    "CPIUFDSL",
    "CUSR0000SAH1",
    "CUSR0000SEHC",
    "CUSR0000SACL1E",
    "CUSR0000SASLE",
  ].map((x) => x.toUpperCase()),
);

/**
 * 将美国 FRED CPI 指数条目呈现为「同比」变体：键加 `::yoy`、标签补「同比」。
 * 选中后由 MacroSection 的变体推断算成同比（DEFAULT calc 仍为原始，故不影响其它页面）。
 * 已含「同比/环比」或非 fred / 已带变体的条目原样返回。
 */
function toCpiYoyItem(item: UnifiedCatalogItem): UnifiedCatalogItem {
  if (!item.key.startsWith("fred:") || item.key.includes("::")) return item;
  const label = /同比|环比/.test(item.label) ? item.label : `${item.label} 同比`;
  return { ...item, key: `${item.key}::yoy`, label };
}

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

/** 将 CPI 相关分类并入 价格指数（非美）或 通胀与价格（美国）→ CPI */
export function consolidatePriceIndexCpi(country: UnifiedCatalogCountry): UnifiedCatalogCountry {
  const priceCategory =
    country.code === "US" ? US_INFLATION_CATEGORY : PRICE_INDEX_CATEGORY;
  const cpiItems: UnifiedCatalogItem[] = [];
  const otherCategories: UnifiedCatalogGroup[] = [];
  let priceIndex: UnifiedCatalogGroup | null = null;

  for (const cat of country.categories) {
    if (isLegacyCpiCategoryName(cat.name)) {
      cpiItems.push(...allItemsInGroup(cat));
      continue;
    }
    if (cat.name === PRICE_INDEX_CATEGORY || cat.name === US_INFLATION_CATEGORY) {
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
        name: priceCategory,
        items: direct,
        subgroups: (cat.subgroups ?? []).filter((s) => s.name !== CPI_SUBGROUP),
      };
      if (priceIndex.subgroups?.length === 0) priceIndex.subgroups = undefined;
      continue;
    }
    otherCategories.push(cat);
  }

  if (cpiItems.length > 0 || priceIndex) {
    const base = priceIndex ?? { name: priceCategory, items: [] };
    const subgroups = mergeSubgroups(base.subgroups, [
      { name: CPI_SUBGROUP, items: dedupeItems(cpiItems) },
    ]);
    otherCategories.push({
      name: priceCategory,
      items: base.items,
      subgroups,
    });
  }

  otherCategories.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return { ...country, categories: otherCategories };
}

function isUsCpiFredIndexItem(item: UnifiedCatalogItem): boolean {
  return (
    item.key.startsWith("fred:") &&
    !item.key.includes("::") &&
    shouldAssignCpiSubgroup(item.label, item.key)
  );
}

type WorkingCategory = {
  name: string;
  items: UnifiedCatalogItem[];
  subgroups: UnifiedCatalogSubgroup[];
};

/**
 * **布局应用之后** 的收尾：把美国 CPI 指数条目统一呈现为「同比」，并拆成
 * 「CPI」（主口径）+「CPI 分项」两个子层。
 *
 * 必须在 applyCatalogLayout 之后跑：存量 MacroCatalogLayout 按原始基键
 * （fred:CPIAUCSL）匹配条目，若在 base 阶段就把键改成 ::yoy，布局会认不出而全
 * 丢进「未分配」。这里从 **最终** 结构里（含未被布局收录、落在「未分配」的新分项）
 * 摘出全部 CPI 指数条目，改标签/键后放回「通胀与价格」，并清掉空的原位置。
 */
export function presentUsCpiAsYoy(
  countries: UnifiedCatalogCountry[],
): UnifiedCatalogCountry[] {
  return countries.map((country) => {
    if (country.code !== "US") return country;

    const gathered: UnifiedCatalogItem[] = [];
    const take = (items: UnifiedCatalogItem[]): UnifiedCatalogItem[] => {
      const kept: UnifiedCatalogItem[] = [];
      for (const it of items) {
        if (isUsCpiFredIndexItem(it)) gathered.push(it);
        else kept.push(it);
      }
      return kept;
    };

    const categories: WorkingCategory[] = country.categories.map((cat) => ({
      name: cat.name,
      items: take(cat.items),
      subgroups: (cat.subgroups ?? []).map((sg) => ({
        name: sg.name,
        items: take(sg.items),
      })),
    }));

    if (gathered.length === 0) return country;

    const aggregates: UnifiedCatalogItem[] = [];
    const details: UnifiedCatalogItem[] = [];
    for (const it of gathered) {
      const fredId = fredIdFromCatalogKey(it.key);
      const yoy = toCpiYoyItem(it);
      if (fredId && CPI_AGGREGATE_IDS.has(fredId)) aggregates.push(yoy);
      else details.push(yoy);
    }
    const cpiSubgroups: UnifiedCatalogSubgroup[] = [
      { name: CPI_SUBGROUP, items: dedupeItems(aggregates) },
      { name: CPI_SUBITEMS_SUBGROUP, items: dedupeItems(details) },
    ].filter((sg) => sg.items.length > 0);

    const inflIdx = categories.findIndex((c) => c.name === US_INFLATION_CATEGORY);
    if (inflIdx >= 0) {
      const cat = categories[inflIdx]!;
      const nonCpi = cat.subgroups.filter(
        (sg) => sg.name !== CPI_SUBGROUP && sg.name !== CPI_SUBITEMS_SUBGROUP,
      );
      categories[inflIdx] = {
        name: cat.name,
        items: cat.items,
        subgroups: [...cpiSubgroups, ...nonCpi],
      };
    } else {
      categories.push({
        name: US_INFLATION_CATEGORY,
        items: [],
        subgroups: cpiSubgroups,
      });
    }

    const cleaned: UnifiedCatalogGroup[] = categories
      .map((c) => ({
        name: c.name,
        items: c.items,
        subgroups: c.subgroups.filter((sg) => sg.items.length > 0),
      }))
      .filter((c) => c.items.length > 0 || c.subgroups.length > 0)
      .map((c) => ({
        name: c.name,
        items: c.items,
        subgroups: c.subgroups.length ? c.subgroups : undefined,
      }));

    return { ...country, categories: cleaned };
  });
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
