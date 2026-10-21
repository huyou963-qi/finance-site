import type { FetchIncrementalResult } from "../types";
import { US_TRADE_PROVIDER } from "../usTradeDetail/catalog";
import { fetchUsTradeDetailSeries } from "../usTradeDetail/client";
import { acquireCensusPartner } from "../usTradeDetail/partnerAcquisition";

export async function fetchUsTradeDetailIncremental(metadata: unknown, instrumentCode: string): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string } } | null)?.scrape;
  if (scrape?.provider !== US_TRADE_PROVIDER) throw new Error(`Invalid Census trade routing: ${instrumentCode}`);
  if (/^census_us_trade_(exports|imports)_country_nsa_\d{4}$/.test(instrumentCode) && process.env.CENSUS_API_KEY?.trim()) {
    return acquireCensusPartner(instrumentCode);
  }
  const series = await fetchUsTradeDetailSeries(instrumentCode);
  if (!series?.points.length) throw new Error(`Census trade source omitted ${instrumentCode}`);
  return { points: series.points, sourceLatestObsDate: series.points.at(-1)!.obsDate, skippedInvalid: 0 };
}
