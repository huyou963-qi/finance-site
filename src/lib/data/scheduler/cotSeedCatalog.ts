import type { CotProductDef } from "@/lib/data/cot/cotProductCatalog";
import { cotCatalogLabel } from "@/lib/data/cot/cotCatalog";
import type { FetchAcquisitionRecord } from "./fetchAcquisition";
import type { CotInstrumentCotMeta } from "./cftcCot/types";

export const CFTC_COT_SOURCE = {
  id: "cftc-cot",
  agencyId: "us-cftc",
  name: "CFTC COT Disaggregated Combined",
  baseUrl: "https://publicreporting.cftc.gov/resource/kh3c-gbw2.json",
  termsUrl: "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
  rateLimit: { requestsPerMinute: 30, minIntervalMs: 2000 },
} as const;

export function readCotMeta(metadata: unknown): CotInstrumentCotMeta | null {
  if (!metadata || typeof metadata !== "object") return null;
  const cot = (metadata as Record<string, unknown>).cot;
  if (!cot || typeof cot !== "object") return null;
  const c = cot as Record<string, unknown>;
  const metric = c.metric === "long" || c.metric === "short" ? c.metric : null;
  const productSlug = typeof c.productSlug === "string" ? c.productSlug : null;
  const match = c.match;
  if (!metric || !productSlug || !match || typeof match !== "object") return null;
  const m = match as Record<string, unknown>;
  return {
    productSlug,
    metric,
    match: {
      mode: m.mode === "aggregate_markets" ? "aggregate_markets" : "single_max_oi",
      commodityPatterns: Array.isArray(m.commodityPatterns)
        ? m.commodityPatterns.map(String)
        : [],
      marketPatterns: Array.isArray(m.marketPatterns) ? m.marketPatterns.map(String) : [],
      excludeMarketPatterns: Array.isArray(m.excludeMarketPatterns)
        ? m.excludeMarketPatterns.map(String)
        : undefined,
      exactMarketSubstrings: Array.isArray(m.exactMarketSubstrings)
        ? m.exactMarketSubstrings.map(String)
        : undefined,
    },
  };
}

export function buildCotInstrumentMetadata(
  product: CotProductDef,
  metric: "long" | "short",
  acquisition: FetchAcquisitionRecord,
): Record<string, unknown> {
  return {
    sourceTag: "cftc-cot",
    countryCode: "US",
    catalogCategory: "CFTC数据",
    cotSector: product.sector,
    cot: {
      productSlug: product.slug,
      metric,
      match: product.match,
    },
    fetchAcquisition: acquisition,
    displayName: cotCatalogLabel(product.label, metric),
  };
}

export function cotInstrumentName(product: CotProductDef, metric: "long" | "short"): string {
  return metric === "long"
    ? `COT 管理基金多头 · ${product.label}`
    : `COT 管理基金空头 · ${product.label}`;
}
