import { NBS_CPI_INDEX_URL } from "./catalog";
import { clearPriceWorkbookCache, fetchNbsPriceWorkbook, parsePriceArticleUrl, parsePriceWorkbookUrl,
  type PriceWorkbookOptions, type PriceWorkbookResult } from "../nbsPriceRelease/client";
export type NbsCpiWorkbookResult = PriceWorkbookResult;
export function parseLatestCpiArticleUrl(html: string, indexUrl = NBS_CPI_INDEX_URL) {
  return parsePriceArticleUrl(html, "CPI", indexUrl);
}
export function parseCpiWorkbookUrl(html: string, articleUrl: string) {
  return parsePriceWorkbookUrl(html, articleUrl, "CPI");
}
export function fetchNbsCpiWorkbook(opts?: PriceWorkbookOptions): Promise<NbsCpiWorkbookResult> {
  return fetchNbsPriceWorkbook("CPI", { indexUrl: NBS_CPI_INDEX_URL, ...opts });
}
export function clearNbsCpiCache() { clearPriceWorkbookCache("CPI"); }
