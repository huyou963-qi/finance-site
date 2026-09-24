import type { FetchIncrementalResult } from "../types";
import { US_TRADE_PROVIDER } from "../usTradeDetail/catalog";
import { fetchUsTradeDetail } from "../usTradeDetail/client";

export async function fetchUsTradeDetailIncremental(metadata: unknown, instrumentCode: string): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string } } | null)?.scrape;
  if (scrape?.provider !== US_TRADE_PROVIDER) throw new Error(`Invalid Census trade routing: ${instrumentCode}`);
  const series = (await fetchUsTradeDetail()).find((row) => row.code === instrumentCode);
  if (!series?.points.length) throw new Error(`Census trade source omitted ${instrumentCode}`);
  return { points: series.points, sourceLatestObsDate: series.points.at(-1)!.obsDate, skippedInvalid: 0 };
}
