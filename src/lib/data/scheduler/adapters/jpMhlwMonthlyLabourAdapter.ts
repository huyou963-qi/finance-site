import type { FetchIncrementalResult } from "../types";
import {
  JP_MHLW_MONTHLY_LABOUR_PROVIDER,
  jpMhlwMonthlyLabourSeriesByCode,
} from "../jpMhlwMonthlyLabour/catalog";
import { fetchJpMhlwMonthlyLabourWorkbook } from "../jpMhlwMonthlyLabour/client";
import { parseJpMhlwMonthlyLabourWorkbook } from "../jpMhlwMonthlyLabour/parser";

export async function fetchJpMhlwMonthlyLabourIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const scrape =
    metadata && typeof metadata === "object"
      ? (metadata as { scrape?: { provider?: string; fixturePath?: string } }).scrape
      : undefined;
  const series = jpMhlwMonthlyLabourSeriesByCode(instrumentCode);
  if (scrape?.provider !== JP_MHLW_MONTHLY_LABOUR_PROVIDER || !series) {
    throw new Error(`MHLW monthly labour invalid routing: ${instrumentCode}`);
  }
  // Full reread is intentional: long-series workbooks are revised in place.
  const points = parseJpMhlwMonthlyLabourWorkbook(
    await fetchJpMhlwMonthlyLabourWorkbook(instrumentCode, scrape.fixturePath),
    series,
  );
  return { points, sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}
