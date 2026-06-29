import { prisma } from "@/lib/prisma";
import { allItemsInGroup } from "@/lib/data/catalogTree";
import { randomUUID } from "@/lib/randomId";
import type { UnifiedCatalogCountry, UnifiedCatalogGroup, UnifiedCatalogItem } from "./fredCatalog";

export const CATALOG_LAYOUT_VERSION = 1 as const;
export const UNASSIGNED_CATEGORY_NAME = "未分配";

export type CatalogLayoutSubgroup = {
  id: string;
  name: string;
  itemKeys: string[];
};

export type CatalogLayoutCategory = {
  id: string;
  name: string;
  itemKeys: string[];
  subgroups: CatalogLayoutSubgroup[];
};

export type CatalogLayoutCountry = {
  countryCode: string;
  categories: CatalogLayoutCategory[];
};

export type CatalogLayoutDocument = {
  version: typeof CATALOG_LAYOUT_VERSION;
  countries: CatalogLayoutCountry[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function sanitizeSubgroup(raw: unknown): CatalogLayoutSubgroup | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!id || !name) return null;
  return { id, name, itemKeys: asStringArray(raw.itemKeys) };
}

function sanitizeCategory(raw: unknown): CatalogLayoutCategory | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!id || !name) return null;
  const subgroups = Array.isArray(raw.subgroups)
    ? raw.subgroups.map(sanitizeSubgroup).filter((x): x is CatalogLayoutSubgroup => x !== null)
    : [];
  return { id, name, itemKeys: asStringArray(raw.itemKeys), subgroups };
}

function sanitizeCountry(raw: unknown): CatalogLayoutCountry | null {
  if (!isRecord(raw)) return null;
  const countryCode =
    typeof raw.countryCode === "string" ? raw.countryCode.trim().toUpperCase() : "";
  if (!countryCode) return null;
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map(sanitizeCategory).filter((x): x is CatalogLayoutCategory => x !== null)
    : [];
  return { countryCode, categories };
}

export function sanitizeCatalogLayoutDocument(input: unknown): CatalogLayoutDocument | null {
  if (!isRecord(input)) return null;
  const countries = Array.isArray(input.countries)
    ? input.countries.map(sanitizeCountry).filter((x): x is CatalogLayoutCountry => x !== null)
    : [];
  if (countries.length === 0) return null;
  return { version: CATALOG_LAYOUT_VERSION, countries };
}

function collectItemsByCountry(
  base: UnifiedCatalogCountry[],
): Map<string, Map<string, UnifiedCatalogItem>> {
  const out = new Map<string, Map<string, UnifiedCatalogItem>>();
  for (const country of base) {
    const map = new Map<string, UnifiedCatalogItem>();
    for (const cat of country.categories) {
      for (const item of allItemsInGroup(cat)) {
        map.set(item.key, item);
      }
    }
    out.set(country.code, map);
  }
  return out;
}

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

function pruneEmptyGroups(countries: UnifiedCatalogCountry[]): UnifiedCatalogCountry[] {
  return countries
    .map((country) => ({
      ...country,
      categories: country.categories
        .map((cat) => ({
          ...cat,
          subgroups: (cat.subgroups ?? []).filter((sg) => sg.items.length > 0),
        }))
        .filter((cat) => cat.items.length > 0 || (cat.subgroups?.length ?? 0) > 0),
    }))
    .filter((c) => c.categories.length > 0);
}

/** 从当前目录树导出可编辑布局（保留顺序） */
export function exportCatalogLayout(countries: UnifiedCatalogCountry[]): CatalogLayoutDocument {
  return {
    version: CATALOG_LAYOUT_VERSION,
    countries: countries.map((country) => ({
      countryCode: country.code,
      categories: country.categories.map((cat) => ({
        id: randomUUID(),
        name: cat.name,
        itemKeys: cat.items.map((i) => i.key),
        subgroups: (cat.subgroups ?? []).map((sg) => ({
          id: randomUUID(),
          name: sg.name,
          itemKeys: sg.items.map((i) => i.key),
        })),
      })),
    })),
  };
}

/** 将布局叠加到默认目录树；未出现在布局中的新指标归入「未分配」 */
export function applyCatalogLayout(
  base: UnifiedCatalogCountry[],
  layout: CatalogLayoutDocument,
): UnifiedCatalogCountry[] {
  const itemsByCountry = collectItemsByCountry(base);
  const baseCountryMap = new Map(base.map((c) => [c.code, c]));
  const layoutCountryMap = new Map(layout.countries.map((c) => [c.countryCode, c]));

  const orderedCodes: string[] = [];
  for (const lc of layout.countries) {
    if (!orderedCodes.includes(lc.countryCode)) orderedCodes.push(lc.countryCode);
  }
  for (const code of baseCountryMap.keys()) {
    if (!orderedCodes.includes(code)) orderedCodes.push(code);
  }

  const result: UnifiedCatalogCountry[] = [];

  for (const code of orderedCodes) {
    const baseCountry = baseCountryMap.get(code);
    const layoutCountry = layoutCountryMap.get(code);
    const itemMap = itemsByCountry.get(code) ?? new Map<string, UnifiedCatalogItem>();

    if (!layoutCountry) {
      if (baseCountry) result.push(baseCountry);
      continue;
    }

    const used = new Set<string>();
    const categories: UnifiedCatalogGroup[] = [];

    for (const layCat of layoutCountry.categories) {
      const directItems: UnifiedCatalogItem[] = [];
      for (const key of dedupeKeys(layCat.itemKeys)) {
        if (used.has(key)) continue;
        const item = itemMap.get(key);
        if (!item) continue;
        used.add(key);
        directItems.push({ ...item, categoryName: layCat.name });
      }

      const subgroups = layCat.subgroups.map((laySg) => {
        const sgItems: UnifiedCatalogItem[] = [];
        for (const key of dedupeKeys(laySg.itemKeys)) {
          if (used.has(key)) continue;
          const item = itemMap.get(key);
          if (!item) continue;
          used.add(key);
          sgItems.push({ ...item, categoryName: `${layCat.name} / ${laySg.name}` });
        }
        return { name: laySg.name, items: sgItems };
      });

      categories.push({
        name: layCat.name,
        items: directItems,
        subgroups: subgroups.length ? subgroups : undefined,
      });
    }

    const unassigned: UnifiedCatalogItem[] = [];
    for (const [key, item] of itemMap) {
      if (used.has(key)) continue;
      used.add(key);
      unassigned.push({ ...item, categoryName: UNASSIGNED_CATEGORY_NAME });
    }
    if (unassigned.length > 0) {
      const existing = categories.find((c) => c.name === UNASSIGNED_CATEGORY_NAME);
      if (existing) {
        existing.items.push(...unassigned);
      } else {
        categories.push({ name: UNASSIGNED_CATEGORY_NAME, items: unassigned });
      }
    }

    result.push({
      code,
      name: baseCountry?.name ?? code,
      categories,
    });
  }

  return pruneEmptyGroups(result);
}

export async function loadMacroCatalogLayout(): Promise<CatalogLayoutDocument | null> {
  const row = await prisma.macroCatalogLayout.findUnique({ where: { id: "default" } });
  if (!row) return null;
  return sanitizeCatalogLayoutDocument(row.layout);
}

export async function saveMacroCatalogLayout(
  layout: CatalogLayoutDocument,
  updatedBy?: string | null,
): Promise<CatalogLayoutDocument> {
  const sanitized = sanitizeCatalogLayoutDocument(layout);
  if (!sanitized) throw new Error("布局格式无效");

  await prisma.macroCatalogLayout.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      layout: sanitized as object,
      updatedBy: updatedBy ?? null,
    },
    update: {
      layout: sanitized as object,
      updatedBy: updatedBy ?? null,
    },
  });
  return sanitized;
}

export async function deleteMacroCatalogLayout(): Promise<void> {
  await prisma.macroCatalogLayout.deleteMany({ where: { id: "default" } });
}

export function collectItemLabels(countries: UnifiedCatalogCountry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const country of countries) {
    for (const cat of country.categories) {
      for (const item of allItemsInGroup(cat)) {
        out[item.key] = item.label;
      }
    }
  }
  return out;
}

export type CatalogLayoutApiPayload = {
  layout: CatalogLayoutDocument;
  defaultLayout: CatalogLayoutDocument;
  isCustom: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  itemLabels: Record<string, string>;
};
