import type { CotMatchMode } from "@/lib/data/cot/cotProductCatalog";

// 官方分项合并报告历史最早可回溯至 2006 年，不能与 Legacy 报告混接。
export const CFTC_COT_HISTORY_START = "2006-01-01";

export const CFTC_DISAGG_COMBINED_DATASET = "kh3c-gbw2";

export const CFTC_COT_API_BASE =
  `https://publicreporting.cftc.gov/resource/${CFTC_DISAGG_COMBINED_DATASET}.json`;

/** Official current-year Disaggregated Futures-and-Options Combined text file. */
export const CFTC_DISAGG_COMBINED_CURRENT_URL =
  "https://www.cftc.gov/dea/newcot/c_disagg.txt";

export type CftcCotRow = {
  reportDate: Date;
  reportDateIso: string;
  commodity: string;
  contractMarketCode?: string;
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
  contractMarketCodes?: string[];
};

export type CotInstrumentCotMeta = {
  productSlug: string;
  /** `net` is the official-report calculation: Managed Money long minus short. */
  metric: "long" | "short" | "net";
  match: CotMatchSpec;
};
