import type { FetchIncrementalResult } from "../types";
import { JP_METI_RETAIL_PROVIDER, JP_METI_RETAIL_SERIES } from "../jpMetiRetail/catalog";
import { fetchJpMetiRetailWorkbook } from "../jpMetiRetail/client";
import { parseJpMetiRetailWorkbook } from "../jpMetiRetail/parser";

export async function fetchJpMetiRetailIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string; fixturePath?: string } } | null)?.scrape;
  if (
    scrape?.provider !== JP_METI_RETAIL_PROVIDER ||
    !JP_METI_RETAIL_SERIES.some((series) => series.instrumentCode === instrumentCode)
  ) {
    throw new Error(`METI commerce invalid routing: ${instrumentCode}`);
  }
  const points = parseJpMetiRetailWorkbook(await fetchJpMetiRetailWorkbook(scrape.fixturePath))[
    instrumentCode
  ];
  if (!points?.length) throw new Error(`METI commerce empty series: ${instrumentCode}`);
  return { points, sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0 };
}

