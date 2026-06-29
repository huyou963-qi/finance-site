import {
  COT_MM_PRODUCTS,
  cotInstrumentCode,
  type CotMetric,
} from "./cotProductCatalog";
import {
  macroCountryName,
  type UnifiedCatalogCountry,
  type UnifiedCatalogItem,
} from "../fredCatalog";

export const COT_CATALOG_CATEGORY = "CFTC数据";

const METRIC_LABEL: Record<CotMetric, string> = {
  long: "管理基金多头",
  short: "管理基金空头",
};

export function cotCatalogLabel(productLabel: string, metric: CotMetric): string {
  return `${productLabel} · ${METRIC_LABEL[metric]}`;
}

/** 美国 → CFTC数据 → 各品种 long/short（与 DB 仪器 code 对齐） */
export function buildCotCatalogCountry(): UnifiedCatalogCountry {
  const items: UnifiedCatalogItem[] = [];
  const sorted = [...COT_MM_PRODUCTS].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const product of sorted) {
    for (const metric of ["long", "short"] as const) {
      items.push({
        key: `mds:${cotInstrumentCode(product.slug, metric)}`,
        label: cotCatalogLabel(product.label, metric),
        frequency: "周",
        provider: "mds",
        countryCode: "US",
        categoryName: COT_CATALOG_CATEGORY,
      });
    }
  }

  return {
    code: "US",
    name: macroCountryName("US"),
    categories: [{ name: COT_CATALOG_CATEGORY, items }],
  };
}
