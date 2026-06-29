import type { CotMatchMode } from "@/lib/data/cot/cotProductCatalog";

export const CFTC_DISAGG_COMBINED_DATASET = "kh3c-gbw2";

export const CFTC_COT_API_BASE =
  `https://publicreporting.cftc.gov/resource/${CFTC_DISAGG_COMBINED_DATASET}.json`;

export type CftcCotRow = {
  reportDate: Date;
  reportDateIso: string;
  commodity: string;
  market: string;
  mmLong: number | null;
  mmShort: number | null;
  openInterest: number | null;
};

export type CotMatchSpec = {
  mode: CotMatchMode;
  commodityPatterns: string[];
  marketPatterns: string[];
  excludeMarketPatterns?: string[];
  exactMarketSubstrings?: string[];
};

export type CotInstrumentCotMeta = {
  productSlug: string;
  metric: "long" | "short";
  match: CotMatchSpec;
};
